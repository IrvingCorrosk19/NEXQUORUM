namespace Asambleas.Application.PhOnboarding;

using System.Globalization;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.PhOnboarding;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Application service for the PH onboarding wizard: PH profile, units, owners/ownerships,
/// coefficient validation, readiness gating, lifecycle transitions and multi-PH membership.
/// </summary>
public sealed class PhOnboardingService
{
    private const int MaxBulkUnits = 5000;

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;

    public PhOnboardingService(IAsambleasDbContext db, ICurrentTenant currentTenant, IAuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
    }

    public async Task<IReadOnlyList<PhSummaryDto>> ListPhAsync(CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var phs = await _db.PropertyHorizontals
            .AsNoTracking()
            .Where(p => p.TenantId == _currentTenant.TenantId)
            .OrderBy(p => p.Name)
            .ToListAsync(cancellationToken);

        if (phs.Count == 0)
        {
            return [];
        }

        var phIds = phs.Select(p => p.Id).ToList();

        var unitStats = await _db.Units
            .AsNoTracking()
            .Where(u => phIds.Contains(u.PropertyHorizontalId))
            .GroupBy(u => u.PropertyHorizontalId)
            .Select(g => new
            {
                PropertyHorizontalId = g.Key,
                UnitCount = g.Count(),
                ActiveCoefficientTotal = g.Where(u => u.IsActive).Sum(u => u.CoefficientPercent)
            })
            .ToListAsync(cancellationToken);

        var ownerCounts = await (
            from u in _db.Units.AsNoTracking()
            join o in _db.Ownerships.AsNoTracking() on u.Id equals o.UnitId
            where phIds.Contains(u.PropertyHorizontalId) && o.IsActive
            select new { u.PropertyHorizontalId, o.OwnerId })
            .Distinct()
            .GroupBy(x => x.PropertyHorizontalId)
            .Select(g => new { PropertyHorizontalId = g.Key, OwnerCount = g.Count() })
            .ToListAsync(cancellationToken);

        var activeUsers = await (
            from u in _db.Units.AsNoTracking()
            join o in _db.Ownerships.AsNoTracking() on u.Id equals o.UnitId
            join owr in _db.Owners.AsNoTracking() on o.OwnerId equals owr.Id
            where phIds.Contains(u.PropertyHorizontalId) && o.IsActive && owr.UserId != null
                  && (owr.Status == OwnerLifecycleStatus.Active || owr.Status == OwnerLifecycleStatus.Invited)
            select new { u.PropertyHorizontalId, owr.UserId })
            .Distinct()
            .GroupBy(x => x.PropertyHorizontalId)
            .Select(g => new { PropertyHorizontalId = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var nextAssemblies = await _db.Assemblies.AsNoTracking()
            .Where(a => phIds.Contains(a.PropertyHorizontalId)
                        && a.ScheduledAtUtc >= DateTimeOffset.UtcNow.AddDays(-1))
            .OrderBy(a => a.ScheduledAtUtc)
            .Select(a => new { a.PropertyHorizontalId, a.ScheduledAtUtc, a.Title })
            .ToListAsync(cancellationToken);

        return phs.Select(p =>
        {
            var stats = unitStats.FirstOrDefault(s => s.PropertyHorizontalId == p.Id);
            var ownerCount = ownerCounts.FirstOrDefault(o => o.PropertyHorizontalId == p.Id)?.OwnerCount ?? 0;
            var users = activeUsers.FirstOrDefault(o => o.PropertyHorizontalId == p.Id)?.Count ?? 0;
            var total = CoefficientValidator.Normalize(stats?.ActiveCoefficientTotal ?? 0m);
            var next = nextAssemblies.FirstOrDefault(a => a.PropertyHorizontalId == p.Id);

            return new PhSummaryDto(
                p.Id,
                p.Code,
                p.Name,
                p.LegalName,
                p.Status.ToString(),
                p.OnboardingStep,
                stats?.UnitCount ?? 0,
                ownerCount,
                users,
                total,
                CoefficientValidator.IsComplete(total),
                p.TimeZoneId,
                next?.ScheduledAtUtc,
                next?.Title);
        }).ToList();
    }

    public async Task<PhDetailDto> GetPhAsync(Guid propertyHorizontalId, CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        return ToDetail(ph);
    }

    public async Task<PhDetailDto> CreatePhAsync(CreatePhRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new DomainException("PH_NAME_REQUIRED", "El nombre del PH es obligatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.Code))
        {
            throw new DomainException("PH_CODE_REQUIRED", "El código interno del PH es obligatorio.");
        }

        if (string.IsNullOrWhiteSpace(request.TimeZoneId))
        {
            throw new DomainException("PH_TIMEZONE_REQUIRED", "La zona horaria es obligatoria.");
        }

        var organizationId = await ResolveOrganizationIdAsync(request.OrganizationId, cancellationToken);

        var code = request.Code.Trim();
        var codeExists = await _db.PropertyHorizontals
            .AsNoTracking()
            .AnyAsync(p => p.TenantId == _currentTenant.TenantId && p.Code == code, cancellationToken);
        if (codeExists)
        {
            throw new DomainException("PH_CODE_DUPLICATE", $"Ya existe un PH con el código '{code}'.");
        }

        var ph = new PropertyHorizontal
        {
            TenantId = _currentTenant.TenantId,
            OrganizationId = organizationId,
            Code = code,
            Name = request.Name.Trim(),
            LegalName = PhOnboardingSupport.Trim(request.LegalName),
            Country = PhOnboardingSupport.Trim(request.Country),
            StateProvince = PhOnboardingSupport.Trim(request.StateProvince),
            City = PhOnboardingSupport.Trim(request.City),
            Address = PhOnboardingSupport.Trim(request.Address),
            TimeZoneId = request.TimeZoneId.Trim(),
            AdminEmail = PhOnboardingSupport.Trim(request.AdminEmail),
            Phone = PhOnboardingSupport.Trim(request.Phone),
            Status = PhLifecycleStatus.Draft,
            OnboardingStep = 1
        };
        _db.PropertyHorizontals.Add(ph);

        _db.UserPropertyMemberships.Add(new UserPropertyMembership
        {
            TenantId = _currentTenant.TenantId,
            UserId = userId,
            PropertyHorizontalId = ph.Id,
            RoleHint = Roles.PHAdmin,
            IsActive = true
        });

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "PHCreated",
            correlationId: ph.Id,
            metadata: new { ph.Code, ph.Name },
            cancellationToken: cancellationToken);

        return ToDetail(ph);
    }

    public async Task<PhDetailDto> UpdatePhAsync(
        Guid propertyHorizontalId,
        UpdatePhRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: true, cancellationToken);

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new DomainException("PH_NAME_REQUIRED", "Name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.TimeZoneId))
        {
            throw new DomainException("PH_TIMEZONE_REQUIRED", "Time zone is required.");
        }

        ph.Name = request.Name.Trim();
        ph.LegalName = PhOnboardingSupport.Trim(request.LegalName);
        ph.Country = PhOnboardingSupport.Trim(request.Country);
        ph.StateProvince = PhOnboardingSupport.Trim(request.StateProvince);
        ph.City = PhOnboardingSupport.Trim(request.City);
        ph.Address = PhOnboardingSupport.Trim(request.Address);
        ph.TimeZoneId = request.TimeZoneId.Trim();
        ph.AdminEmail = PhOnboardingSupport.Trim(request.AdminEmail);
        ph.Phone = PhOnboardingSupport.Trim(request.Phone);

        if (request.OnboardingStep is int step)
        {
            ph.OnboardingStep = Math.Clamp(step, 1, 8);
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "PHUpdated",
            correlationId: ph.Id,
            metadata: new { ph.Code, ph.Name, ph.OnboardingStep },
            cancellationToken: cancellationToken);
        return ToDetail(ph);
    }

    public async Task<IReadOnlyList<UnitDto>> ListUnitsAsync(
        Guid propertyHorizontalId,
        string? search = null,
        string? tower = null,
        bool? isActive = null,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        var query = _db.Units.AsNoTracking().Where(u => u.PropertyHorizontalId == propertyHorizontalId);

        if (!string.IsNullOrWhiteSpace(tower))
        {
            var towerTrim = tower.Trim();
            query = query.Where(u => u.Tower == towerTrim);
        }

        if (isActive is bool active)
        {
            query = query.Where(u => u.IsActive == active);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(u => u.Code.Contains(term) || (u.Tower != null && u.Tower.Contains(term)));
        }

        var rows = await query
            .OrderBy(u => u.Tower)
            .ThenBy(u => u.Floor)
            .ThenBy(u => u.Code)
            .ToListAsync(cancellationToken);

        return rows.Select(ToUnitDto).ToList();
    }

    public async Task<UnitDto> CreateUnitAsync(
        Guid propertyHorizontalId,
        CreateUnitRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        ValidateUnitFields(request.Code, request.CoefficientPercent);
        var code = request.Code.Trim();

        var duplicate = await _db.Units
            .AsNoTracking()
            .AnyAsync(u => u.PropertyHorizontalId == propertyHorizontalId && u.Code == code, cancellationToken);
        if (duplicate)
        {
            throw new DomainException("UNIT_CODE_DUPLICATE", $"Unit code '{code}' already exists in this property horizontal.");
        }

        var unit = new Unit
        {
            TenantId = _currentTenant.TenantId,
            PropertyHorizontalId = propertyHorizontalId,
            Code = code,
            Tower = PhOnboardingSupport.Trim(request.Tower),
            Floor = request.Floor,
            UnitType = PhOnboardingSupport.Trim(request.UnitType),
            CoefficientPercent = CoefficientValidator.Normalize(request.CoefficientPercent),
            IsActive = request.IsActive
        };
        _db.Units.Add(unit);
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "UnitCreated",
            correlationId: unit.Id,
            metadata: new { propertyHorizontalId, unit.Code, unit.CoefficientPercent },
            cancellationToken: cancellationToken);

        return ToUnitDto(unit);
    }

    public async Task<UnitDto> UpdateUnitAsync(
        Guid propertyHorizontalId,
        Guid unitId,
        UpdateUnitRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        var unit = await LoadUnitInPhAsync(propertyHorizontalId, unitId, cancellationToken);

        ValidateUnitFields(request.Code, request.CoefficientPercent);
        var code = request.Code.Trim();

        if (!string.Equals(code, unit.Code, StringComparison.Ordinal))
        {
            var duplicate = await _db.Units
                .AsNoTracking()
                .AnyAsync(u => u.PropertyHorizontalId == propertyHorizontalId && u.Code == code && u.Id != unitId, cancellationToken);
            if (duplicate)
            {
                throw new DomainException("UNIT_CODE_DUPLICATE", $"Unit code '{code}' already exists in this property horizontal.");
            }

            unit.Code = code;
        }

        unit.Tower = PhOnboardingSupport.Trim(request.Tower);
        unit.Floor = request.Floor;
        unit.UnitType = PhOnboardingSupport.Trim(request.UnitType);
        unit.CoefficientPercent = CoefficientValidator.Normalize(request.CoefficientPercent);
        unit.IsActive = request.IsActive;

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "UnitUpdated",
            correlationId: unit.Id,
            metadata: new { propertyHorizontalId, unit.Code, unit.CoefficientPercent, unit.IsActive },
            cancellationToken: cancellationToken);
        return ToUnitDto(unit);
    }

    public async Task<UnitDto> SetUnitActiveAsync(
        Guid propertyHorizontalId,
        Guid unitId,
        bool isActive,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        var unit = await LoadUnitInPhAsync(propertyHorizontalId, unitId, cancellationToken);
        unit.IsActive = isActive;
        await _db.SaveChangesAsync(cancellationToken);

        return ToUnitDto(unit);
    }

    public async Task<BulkGenerateUnitsResultDto> BulkGenerateUnitsAsync(
        Guid propertyHorizontalId,
        BulkGenerateUnitsRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        if (request.FloorFrom > request.FloorTo)
        {
            throw new DomainException("BULK_FLOOR_RANGE_INVALID", "FloorFrom must be less than or equal to FloorTo.");
        }

        if (request.UnitFrom > request.UnitTo)
        {
            throw new DomainException("BULK_UNIT_RANGE_INVALID", "UnitFrom must be less than or equal to UnitTo.");
        }

        if (request.UnitNumberPad is < 1 or > 6)
        {
            throw new DomainException("BULK_PAD_INVALID", "UnitNumberPad must be between 1 and 6.");
        }

        if (request.DefaultCoefficientPercent < 0 || request.DefaultCoefficientPercent > 100)
        {
            throw new DomainException("BULK_COEFFICIENT_INVALID", "DefaultCoefficientPercent must be between 0 and 100.");
        }

        var floorSpan = (long)(request.FloorTo - request.FloorFrom) + 1;
        var unitSpan = (long)(request.UnitTo - request.UnitFrom) + 1;
        if (floorSpan * unitSpan > MaxBulkUnits)
        {
            throw new DomainException("BULK_RANGE_TOO_LARGE", $"Requested range would generate more than {MaxBulkUnits} units.");
        }

        var existingCodes = new HashSet<string>(
            await _db.Units
                .AsNoTracking()
                .Where(u => u.PropertyHorizontalId == propertyHorizontalId)
                .Select(u => u.Code)
                .ToListAsync(cancellationToken),
            StringComparer.OrdinalIgnoreCase);

        var tower = PhOnboardingSupport.Trim(request.Tower);
        var unitType = PhOnboardingSupport.Trim(request.UnitType);
        var normalizedCoefficient = CoefficientValidator.Normalize(request.DefaultCoefficientPercent);

        var codes = new List<string>();
        var seenInBatch = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var toCreate = new List<Unit>();
        var skipped = 0;

        for (var floor = request.FloorFrom; floor <= request.FloorTo; floor++)
        {
            for (var unitNumber = request.UnitFrom; unitNumber <= request.UnitTo; unitNumber++)
            {
                var code = BuildUnitCode(request.Prefix, floor, unitNumber, request.UnitNumberPad);
                if (!seenInBatch.Add(code))
                {
                    continue;
                }

                codes.Add(code);

                if (existingCodes.Contains(code))
                {
                    skipped++;
                    continue;
                }

                toCreate.Add(new Unit
                {
                    TenantId = _currentTenant.TenantId,
                    PropertyHorizontalId = propertyHorizontalId,
                    Code = code,
                    Tower = tower,
                    Floor = floor,
                    UnitType = unitType,
                    CoefficientPercent = normalizedCoefficient,
                    IsActive = true
                });
            }
        }

        if (request.PreviewOnly)
        {
            return new BulkGenerateUnitsResultDto(toCreate.Count, skipped, codes, []);
        }

        _db.Units.AddRange(toCreate);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            "UnitBulkGenerated",
            correlationId: propertyHorizontalId,
            metadata: new { created = toCreate.Count, skipped },
            cancellationToken: cancellationToken);

        return new BulkGenerateUnitsResultDto(toCreate.Count, skipped, codes, toCreate.Select(ToUnitDto).ToList());
    }

    public async Task<IReadOnlyList<OwnerListItemDto>> ListOwnersAsync(
        Guid propertyHorizontalId,
        OwnerQuery? query = null,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        query ??= new OwnerQuery();

        var rows = await (
            from o in _db.Owners.AsNoTracking()
            join own in _db.Ownerships.AsNoTracking() on o.Id equals own.OwnerId
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where u.PropertyHorizontalId == propertyHorizontalId && own.IsActive
            select new { Owner = o, Ownership = own, Unit = u })
            .ToListAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(query.Tower))
        {
            var tower = query.Tower.Trim();
            rows = rows.Where(r => string.Equals(r.Unit.Tower, tower, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        if (query.Floor is int floor)
        {
            rows = rows.Where(r => r.Unit.Floor == floor).ToList();
        }

        var items = rows
            .GroupBy(r => r.Owner)
            .Select(g => new OwnerListItemDto(
                g.Key.Id,
                g.Key.DisplayName,
                g.Key.Email,
                g.Key.Identification,
                g.Key.Status.ToString(),
                g.Select(x => x.Unit.Code).Distinct().OrderBy(c => c, StringComparer.OrdinalIgnoreCase).ToList(),
                CoefficientValidator.Normalize(g.Sum(x => x.Unit.CoefficientPercent * x.Ownership.SharePercent / 100m)),
                g.Key.UserId is not null,
                !string.IsNullOrWhiteSpace(g.Key.Email),
                g.Key.UserId))
            .ToList();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            items = items.Where(o =>
                o.DisplayName.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                o.Email.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (o.Identification?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false) ||
                o.UnitCodes.Any(c => c.Contains(term, StringComparison.OrdinalIgnoreCase)))
                .ToList();
        }

        if (!string.IsNullOrWhiteSpace(query.Status)
            && Enum.TryParse<OwnerLifecycleStatus>(query.Status, ignoreCase: true, out var status))
        {
            items = items.Where(o => string.Equals(o.Status, status.ToString(), StringComparison.OrdinalIgnoreCase)).ToList();
        }

        if (query.HasEmail is bool hasEmail)
        {
            items = items.Where(o => o.HasEmail == hasEmail).ToList();
        }

        if (query.HasUser is bool hasUser)
        {
            items = items.Where(o => o.HasUser == hasUser).ToList();
        }

        if (query.Invited is bool invited)
        {
            items = items.Where(o =>
                invited
                    ? string.Equals(o.Status, nameof(OwnerLifecycleStatus.Invited), StringComparison.OrdinalIgnoreCase)
                      || string.Equals(o.Status, nameof(OwnerLifecycleStatus.Active), StringComparison.OrdinalIgnoreCase)
                    : string.Equals(o.Status, nameof(OwnerLifecycleStatus.Draft), StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        return items.OrderBy(o => o.DisplayName, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public async Task<byte[]> ExportOwnersCsvAsync(
        Guid propertyHorizontalId,
        OwnerQuery? query = null,
        CancellationToken cancellationToken = default)
    {
        var owners = await ListOwnersAsync(propertyHorizontalId, query, cancellationToken);
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("Nombre,Email,Identificacion,Estado,Unidades,Coeficiente,TieneUsuario");
        foreach (var o in owners)
        {
            sb.AppendLine(string.Join(',',
                Csv(o.DisplayName),
                Csv(o.Email),
                Csv(o.Identification),
                Csv(o.Status),
                Csv(string.Join('|', o.UnitCodes)),
                o.CoefficientPercent.ToString(CultureInfo.InvariantCulture),
                o.HasUser ? "1" : "0"));
        }

        await _audit.WriteAsync(
            "OwnerExport",
            correlationId: propertyHorizontalId,
            metadata: new { count = owners.Count },
            cancellationToken: cancellationToken);

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    public async Task<BulkValidateOwnersResultDto> ValidateOwnersBulkAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        var owners = await ListOwnersAsync(propertyHorizontalId, null, cancellationToken);
        var issues = new List<string>();
        var withoutEmail = owners.Count(o => !o.HasEmail);
        var withoutUnit = owners.Count(o => o.UnitCodes.Count == 0);
        var withoutUser = owners.Count(o => !o.HasUser);
        if (withoutEmail > 0)
        {
            issues.Add($"{withoutEmail} propietario(s) sin correo.");
        }

        if (withoutUnit > 0)
        {
            issues.Add($"{withoutUnit} propietario(s) sin unidad asociada.");
        }

        if (withoutUser > 0)
        {
            issues.Add($"{withoutUser} propietario(s) sin usuario de portal.");
        }

        return new BulkValidateOwnersResultDto(owners.Count, withoutEmail, withoutUnit, withoutUser, issues);
    }

    private static string Csv(string? value)
    {
        var v = value ?? string.Empty;
        if (v.Contains(',') || v.Contains('"') || v.Contains('\n'))
        {
            return $"\"{v.Replace("\"", "\"\"")}\"";
        }

        // Formula injection guard for spreadsheet consumers.
        if (v.Length > 0 && "=+-@".Contains(v[0]))
        {
            return $"\"'{v.Replace("\"", "\"\"")}\"";
        }

        return v;
    }

    public async Task<OwnerDetailDto> GetOwnerAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        var owner = await LoadOwnerAsync(ownerId, cancellationToken);
        var links = await LoadOwnerUnitLinksAsync(propertyHorizontalId, ownerId, cancellationToken);
        return ToOwnerDetail(owner, links);
    }

    public async Task<OwnerDetailDto> CreateOwnerAsync(
        Guid propertyHorizontalId,
        CreateOwnerRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        if (!PhOnboardingSupport.IsValidEmail(request.Email))
        {
            throw new DomainException("OWNER_EMAIL_INVALID", "El correo no tiene un formato válido.");
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var owner = await _db.Owners.FirstOrDefaultAsync(
            o => o.TenantId == _currentTenant.TenantId && o.Email == email, cancellationToken);

        if (owner is null)
        {
            owner = new Owner
            {
                TenantId = _currentTenant.TenantId,
                DisplayName = PhOnboardingSupport.BuildDisplayName(request.FirstName, request.LastName, request.DisplayName, email),
                FirstName = PhOnboardingSupport.Trim(request.FirstName),
                LastName = PhOnboardingSupport.Trim(request.LastName),
                IdentificationType = PhOnboardingSupport.Trim(request.IdentificationType),
                Identification = PhOnboardingSupport.Trim(request.Identification),
                Email = email,
                Phone = PhOnboardingSupport.Trim(request.Phone),
                Status = OwnerLifecycleStatus.Draft
            };
            _db.Owners.Add(owner);
        }

        if (request.UnitId is Guid unitId)
        {
            var unit = await LoadUnitInPhAsync(propertyHorizontalId, unitId, cancellationToken);
            var sharePercent = request.SharePercent ?? 100m;
            if (sharePercent <= 0 || sharePercent > 100)
            {
                throw new DomainException("SHARE_PERCENT_INVALID", "SharePercent must be greater than 0 and at most 100.");
            }

            var duplicate = await _db.Ownerships.AnyAsync(
                o => o.UnitId == unit.Id && o.OwnerId == owner.Id, cancellationToken);
            if (duplicate)
            {
                throw new DomainException("OWNERSHIP_DUPLICATE", "This owner is already linked to the unit.");
            }

            _db.Ownerships.Add(new Ownership
            {
                TenantId = _currentTenant.TenantId,
                UnitId = unit.Id,
                OwnerId = owner.Id,
                SharePercent = CoefficientValidator.Normalize(sharePercent),
                EffectiveFromUtc = DateTimeOffset.UtcNow,
                IsActive = true
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "OwnerCreated",
            correlationId: owner.Id,
            metadata: new { propertyHorizontalId, owner.Email },
            cancellationToken: cancellationToken);

        var links = await LoadOwnerUnitLinksAsync(propertyHorizontalId, owner.Id, cancellationToken);
        return ToOwnerDetail(owner, links);
    }

    public async Task<OwnerDetailDto> UpdateOwnerAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        UpdateOwnerRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        var owner = await _db.Owners.FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, owner.TenantId);

        if (!PhOnboardingSupport.IsValidEmail(request.Email))
        {
            throw new DomainException("OWNER_EMAIL_INVALID", "El correo no tiene un formato válido.");
        }

        var email = request.Email.Trim().ToLowerInvariant();
        if (!string.Equals(email, owner.Email, StringComparison.Ordinal))
        {
            var duplicate = await _db.Owners.AnyAsync(
                o => o.TenantId == _currentTenant.TenantId && o.Email == email && o.Id != ownerId, cancellationToken);
            if (duplicate)
            {
                throw new DomainException("OWNER_EMAIL_DUPLICATE", $"Another owner already uses email '{email}'.");
            }

            owner.Email = email;
        }

        owner.FirstName = PhOnboardingSupport.Trim(request.FirstName);
        owner.LastName = PhOnboardingSupport.Trim(request.LastName);
        owner.DisplayName = PhOnboardingSupport.BuildDisplayName(request.FirstName, request.LastName, request.DisplayName, owner.Email);
        owner.IdentificationType = PhOnboardingSupport.Trim(request.IdentificationType);
        owner.Identification = PhOnboardingSupport.Trim(request.Identification);
        owner.Phone = PhOnboardingSupport.Trim(request.Phone);

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            if (!Enum.TryParse<OwnerLifecycleStatus>(request.Status, ignoreCase: true, out var status))
            {
                throw new DomainException("OWNER_STATUS_INVALID", $"Unknown owner status '{request.Status}'.");
            }

            owner.Status = status;
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "OwnerUpdated",
            correlationId: owner.Id,
            metadata: new { propertyHorizontalId, owner.Email, owner.Status },
            cancellationToken: cancellationToken);

        var links = await LoadOwnerUnitLinksAsync(propertyHorizontalId, owner.Id, cancellationToken);
        return ToOwnerDetail(owner, links);
    }

    public async Task<OwnerUnitLinkDto> CreateOwnershipAsync(
        Guid propertyHorizontalId,
        CreateOwnershipRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        var unit = await LoadUnitInPhAsync(propertyHorizontalId, request.UnitId, cancellationToken);
        var owner = await LoadOwnerAsync(request.OwnerId, cancellationToken);

        if (request.SharePercent <= 0 || request.SharePercent > 100)
        {
            throw new DomainException("SHARE_PERCENT_INVALID", "SharePercent must be greater than 0 and at most 100.");
        }

        var duplicate = await _db.Ownerships.AnyAsync(
            o => o.UnitId == request.UnitId && o.OwnerId == request.OwnerId, cancellationToken);
        if (duplicate)
        {
            throw new DomainException("OWNERSHIP_DUPLICATE", "This owner is already linked to the unit.");
        }

        var ownership = new Ownership
        {
            TenantId = _currentTenant.TenantId,
            UnitId = request.UnitId,
            OwnerId = request.OwnerId,
            SharePercent = CoefficientValidator.Normalize(request.SharePercent),
            EffectiveFromUtc = request.EffectiveFromUtc ?? DateTimeOffset.UtcNow,
            IsActive = true
        };
        _db.Ownerships.Add(ownership);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            "OwnershipCreated",
            correlationId: ownership.Id,
            metadata: new { propertyHorizontalId, request.UnitId, request.OwnerId },
            cancellationToken: cancellationToken);

        return new OwnerUnitLinkDto(
            ownership.Id, unit.Id, unit.Code, unit.Tower, unit.CoefficientPercent,
            ownership.SharePercent, ownership.IsActive, ownership.EffectiveFromUtc, ownership.EffectiveToUtc);
    }

    public async Task EndOwnershipAsync(
        Guid propertyHorizontalId,
        Guid ownershipId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        var ownership = await _db.Ownerships.FirstOrDefaultAsync(o => o.Id == ownershipId, cancellationToken)
            ?? throw new DomainException("OWNERSHIP_NOT_FOUND", "Ownership not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, ownership.TenantId);

        var unit = await _db.Units.AsNoTracking().FirstOrDefaultAsync(u => u.Id == ownership.UnitId, cancellationToken)
            ?? throw new DomainException("UNIT_NOT_FOUND", "Unit not found.");
        if (unit.PropertyHorizontalId != propertyHorizontalId)
        {
            throw new DomainException("UNIT_NOT_IN_PH", "Unit does not belong to this property horizontal.");
        }

        if (!ownership.IsActive)
        {
            return;
        }

        ownership.IsActive = false;
        ownership.EffectiveToUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            "OwnershipChanged",
            correlationId: ownership.Id,
            metadata: new { propertyHorizontalId },
            cancellationToken: cancellationToken);
    }

    public async Task<CoefficientValidationDto> ValidateCoefficientsAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        return await BuildCoefficientValidationAsync(propertyHorizontalId, cancellationToken);
    }

    public async Task<PhReadinessDto> GetReadinessAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        return await BuildReadinessAsync(ph, cancellationToken);
    }

    public async Task<PhDetailDto> MarkReadyForAssemblyAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: true, cancellationToken);

        var readiness = await BuildReadinessAsync(ph, cancellationToken);
        if (!readiness.ReadyForAssembly)
        {
            throw new DomainException(
                "PH_NOT_READY",
                "NO LISTO PARA ASAMBLEA: " + string.Join(" ", readiness.BlockingIssues));
        }

        ph.Status = PhLifecycleStatus.ReadyForAssembly;
        ph.OnboardingStep = Math.Max(ph.OnboardingStep, 8);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync("ph.ready_for_assembly", correlationId: ph.Id, cancellationToken: cancellationToken);
        return ToDetail(ph);
    }

    public async Task<PhDetailDto> ActivatePhAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: true, cancellationToken);

        if (ph.Status == PhLifecycleStatus.Draft)
        {
            throw new DomainException("PH_NOT_READY", "Marca el PH como listo para asamblea antes de activarlo.");
        }

        ph.Status = PhLifecycleStatus.Active;
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync("ph.activated", correlationId: ph.Id, cancellationToken: cancellationToken);
        return ToDetail(ph);
    }

    public async Task<IReadOnlyList<PhMembershipDto>> ListMyMembershipsAsync(CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var currentPhId = _currentTenant.PropertyHorizontalId ?? Guid.Empty;

        return await ListMembershipsMarkingCurrentAsync(userId, currentPhId, cancellationToken);
    }

    /// <summary>
    /// Validates that the current user has an active membership on the target PH and returns the
    /// full membership list with that PH flagged as current. The actual session/claim mutation that
    /// persists the active PH context happens at the Web layer (cookie or claim), since
    /// <see cref="ICurrentTenant"/> is a read-only view of the current request.
    /// </summary>
    public async Task<IReadOnlyList<PhMembershipDto>> SwitchActivePhContextAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var ph = await _db.PropertyHorizontals.AsNoTracking().FirstOrDefaultAsync(p => p.Id == propertyHorizontalId, cancellationToken)
            ?? throw new DomainException("PH_NOT_FOUND", "Property horizontal not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, ph.TenantId);

        var hasMembership = await _db.UserPropertyMemberships.AsNoTracking().AnyAsync(
            m => m.UserId == userId && m.PropertyHorizontalId == propertyHorizontalId && m.IsActive, cancellationToken);
        if (!hasMembership)
        {
            throw new DomainException("PH_MEMBERSHIP_NOT_FOUND", "You do not have access to this property horizontal.");
        }

        return await ListMembershipsMarkingCurrentAsync(userId, propertyHorizontalId, cancellationToken);
    }

    private async Task<IReadOnlyList<PhMembershipDto>> ListMembershipsMarkingCurrentAsync(
        Guid userId,
        Guid currentPhId,
        CancellationToken cancellationToken)
    {
        var rows = await (
            from m in _db.UserPropertyMemberships.AsNoTracking()
            join p in _db.PropertyHorizontals.AsNoTracking() on m.PropertyHorizontalId equals p.Id
            where m.UserId == userId && m.IsActive && p.TenantId == _currentTenant.TenantId
            orderby p.Name
            select new { Membership = m, Ph = p })
            .ToListAsync(cancellationToken);

        return rows
            .Select(r => new PhMembershipDto(r.Ph.Id, r.Ph.Code, r.Ph.Name, r.Membership.RoleHint, r.Ph.Id == currentPhId))
            .ToList();
    }

    private async Task<Guid> ResolveOrganizationIdAsync(Guid? requestedOrganizationId, CancellationToken cancellationToken)
    {
        if (requestedOrganizationId is Guid organizationId)
        {
            var org = await _db.Organizations.AsNoTracking().FirstOrDefaultAsync(o => o.Id == organizationId, cancellationToken)
                ?? throw new DomainException("ORG_NOT_FOUND", "Organization not found.");
            TenantGuard.EnsureTenantMatch(_currentTenant, org.TenantId);
            return org.Id;
        }

        var firstOrg = await _db.Organizations
            .AsNoTracking()
            .Where(o => o.TenantId == _currentTenant.TenantId)
            .OrderBy(o => o.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new DomainException("ORG_REQUIRED", "Tenant has no organization to attach the property horizontal to.");

        return firstOrg.Id;
    }

    private async Task<PropertyHorizontal> EnsurePhAccessAsync(Guid propertyHorizontalId, bool track, CancellationToken cancellationToken)
    {
        var query = track ? _db.PropertyHorizontals.AsQueryable() : _db.PropertyHorizontals.AsNoTracking();
        var ph = await query.FirstOrDefaultAsync(p => p.Id == propertyHorizontalId, cancellationToken)
            ?? throw new DomainException("PH_NOT_FOUND", "Property horizontal not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, ph.TenantId);
        return ph;
    }

    private async Task<Unit> LoadUnitInPhAsync(Guid propertyHorizontalId, Guid unitId, CancellationToken cancellationToken)
    {
        var unit = await _db.Units.FirstOrDefaultAsync(u => u.Id == unitId, cancellationToken)
            ?? throw new DomainException("UNIT_NOT_FOUND", "Unit not found.");
        if (unit.PropertyHorizontalId != propertyHorizontalId)
        {
            throw new DomainException("UNIT_NOT_IN_PH", "Unit does not belong to this property horizontal.");
        }

        return unit;
    }

    private async Task<Owner> LoadOwnerAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        var owner = await _db.Owners.AsNoTracking().FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, owner.TenantId);
        return owner;
    }

    private async Task<IReadOnlyList<OwnerUnitLinkDto>> LoadOwnerUnitLinksAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken) =>
        await (
            from own in _db.Ownerships.AsNoTracking()
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where own.OwnerId == ownerId && u.PropertyHorizontalId == propertyHorizontalId
            orderby u.Code
            select new OwnerUnitLinkDto(
                own.Id, u.Id, u.Code, u.Tower, u.CoefficientPercent, own.SharePercent,
                own.IsActive, own.EffectiveFromUtc, own.EffectiveToUtc))
            .ToListAsync(cancellationToken);

    private async Task<CoefficientValidationDto> BuildCoefficientValidationAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken)
    {
        var activeCoefficients = await _db.Units
            .AsNoTracking()
            .Where(u => u.PropertyHorizontalId == propertyHorizontalId && u.IsActive)
            .Select(u => u.CoefficientPercent)
            .ToListAsync(cancellationToken);

        var total = CoefficientValidator.Normalize(activeCoefficients.Sum());
        var isComplete = CoefficientValidator.IsComplete(total);
        var delta = CoefficientValidator.Delta(total);

        var message = activeCoefficients.Count == 0
            ? "No hay unidades activas para validar."
            : isComplete
                ? "Los coeficientes suman 100%."
                : delta > 0
                    ? $"Faltante: {delta.ToString("0.####", CultureInfo.InvariantCulture)}% para llegar a 100%."
                    : $"Excede 100% en {Math.Abs(delta).ToString("0.####", CultureInfo.InvariantCulture)}%.";

        return new CoefficientValidationDto(
            propertyHorizontalId, total, CoefficientValidator.ExpectedTotal, delta, isComplete, activeCoefficients.Count, message);
    }

    private async Task<PhReadinessDto> BuildReadinessAsync(PropertyHorizontal ph, CancellationToken cancellationToken)
    {
        var units = await _db.Units.AsNoTracking()
            .Where(u => u.PropertyHorizontalId == ph.Id)
            .ToListAsync(cancellationToken);
        var activeUnits = units.Where(u => u.IsActive).ToList();
        var unitCount = activeUnits.Count;

        var ownerships = await (
            from o in _db.Ownerships.AsNoTracking()
            join u in _db.Units.AsNoTracking() on o.UnitId equals u.Id
            where u.PropertyHorizontalId == ph.Id
            select new { Ownership = o, Unit = u })
            .ToListAsync(cancellationToken);

        var ownerCount = ownerships.Where(x => x.Ownership.IsActive).Select(x => x.Ownership.OwnerId).Distinct().Count();
        var coefficients = await BuildCoefficientValidationAsync(ph.Id, cancellationToken);

        var invitedUserCount = await (
            from u in _db.Units.AsNoTracking()
            join o in _db.Ownerships.AsNoTracking() on u.Id equals o.UnitId
            join owr in _db.Owners.AsNoTracking() on o.OwnerId equals owr.Id
            where u.PropertyHorizontalId == ph.Id && o.IsActive
                  && (owr.Status == OwnerLifecycleStatus.Invited || owr.Status == OwnerLifecycleStatus.Active)
            select owr.Id)
            .Distinct()
            .CountAsync(cancellationToken);

        var generalInfoComplete = !string.IsNullOrWhiteSpace(ph.Name)
            && !string.IsNullOrWhiteSpace(ph.Code)
            && !string.IsNullOrWhiteSpace(ph.TimeZoneId)
            && !string.IsNullOrWhiteSpace(ph.AdminEmail);

        var unitsComplete = unitCount > 0;
        var ownersComplete = ownerCount > 0;
        const bool assemblyConfigComplete = true;

        var blockingIssues = new List<string>();
        if (!generalInfoComplete)
        {
            blockingIssues.Add("Completa la información general del PH (nombre, código, zona horaria y correo administrativo).");
        }

        if (!unitsComplete)
        {
            blockingIssues.Add("Registra al menos una unidad activa.");
        }

        if (!ownersComplete)
        {
            blockingIssues.Add("Registra al menos un propietario con ownership activo.");
        }

        if (!coefficients.IsComplete)
        {
            blockingIssues.Add(coefficients.Message);
        }

        var duplicateCodes = activeUnits
            .GroupBy(u => u.Code, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();
        if (duplicateCodes.Count > 0)
        {
            blockingIssues.Add($"Unidades duplicadas: {string.Join(", ", duplicateCodes.Take(10))}.");
        }

        var invalidCoefficients = activeUnits.Where(u => u.CoefficientPercent < 0 || u.CoefficientPercent > 100).ToList();
        if (invalidCoefficients.Count > 0)
        {
            blockingIssues.Add($"{invalidCoefficients.Count} unidad(es) con coeficiente inválido (fuera de 0–100).");
        }

        var orphanOwnerships = ownerships.Count(x => x.Ownership.IsActive && !x.Unit.IsActive);
        if (orphanOwnerships > 0)
        {
            blockingIssues.Add($"{orphanOwnerships} relación(es) ownership activas apuntan a unidades inactivas.");
        }

        var shareOverflow = ownerships
            .Where(x => x.Ownership.IsActive)
            .GroupBy(x => x.Unit.Id)
            .Where(g => CoefficientValidator.Normalize(g.Sum(x => x.Ownership.SharePercent)) > 100.0001m)
            .Select(g => g.First().Unit.Code)
            .ToList();
        if (shareOverflow.Count > 0)
        {
            blockingIssues.Add($"Participación (share) corruptas >100% en unidades: {string.Join(", ", shareOverflow.Take(10))}.");
        }

        var readyForAssembly = blockingIssues.Count == 0;

        return new PhReadinessDto(
            ph.Id,
            ph.Name,
            generalInfoComplete,
            unitCount,
            unitsComplete,
            ownerCount,
            ownersComplete,
            coefficients,
            invitedUserCount,
            assemblyConfigComplete,
            readyForAssembly,
            blockingIssues);
    }

    private static void ValidateUnitFields(string code, decimal coefficientPercent)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            throw new DomainException("UNIT_CODE_REQUIRED", "El código de la unidad es obligatorio.");
        }

        if (coefficientPercent < 0 || coefficientPercent > 100)
        {
            throw new DomainException("UNIT_COEFFICIENT_INVALID", "El coeficiente debe estar entre 0 y 100.");
        }
    }

    private static string BuildUnitCode(string? prefix, int floor, int unitNumber, int pad)
    {
        var paddedUnit = unitNumber.ToString(CultureInfo.InvariantCulture).PadLeft(pad, '0');
        return $"{PhOnboardingSupport.Trim(prefix)}{floor}{paddedUnit}";
    }

    private static PhDetailDto ToDetail(PropertyHorizontal ph) => new(
        ph.Id, ph.OrganizationId, ph.Code, ph.Name, ph.LegalName, ph.Country, ph.StateProvince, ph.City, ph.Address,
        ph.TimeZoneId, ph.AdminEmail, ph.Phone, ph.Status.ToString(), ph.OnboardingStep);

    private static UnitDto ToUnitDto(Unit u) =>
        new(u.Id, u.PropertyHorizontalId, u.Code, u.Tower, u.Floor, u.UnitType, u.CoefficientPercent, u.IsActive);

    private static OwnerDetailDto ToOwnerDetail(Owner owner, IReadOnlyList<OwnerUnitLinkDto> links) => new(
        owner.Id, owner.DisplayName, owner.FirstName, owner.LastName, owner.IdentificationType, owner.Identification,
        owner.Email, owner.Phone, owner.Status.ToString(), owner.UserId, links);
}

/// <summary>Small text/validation helpers shared across the PH onboarding services.</summary>
internal static class PhOnboardingSupport
{
    public static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    public static bool IsValidEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        try
        {
            _ = new System.Net.Mail.MailAddress(email.Trim());
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    public static string BuildDisplayName(string? firstName, string? lastName, string? displayName, string fallback)
    {
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName.Trim();
        }

        var full = string.Join(' ', new[] { firstName, lastName }.Where(s => !string.IsNullOrWhiteSpace(s))).Trim();
        return full.Length > 0 ? full : fallback;
    }

    /// <summary>Lowercases, strips diacritics and non-alphanumeric characters for loose name comparison.</summary>
    public static string NormalizeForComparison(string value)
    {
        var decomposed = value.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD);
        var sb = new System.Text.StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                sb.Append(c);
            }
        }

        return System.Text.RegularExpressions.Regex.Replace(sb.ToString(), "[^a-z0-9]", string.Empty);
    }
}
