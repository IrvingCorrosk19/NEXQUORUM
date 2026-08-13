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

        // Only PH managers see the full tenant catalog. Everyone else is membership-scoped.
        IQueryable<PropertyHorizontal> query = _db.PropertyHorizontals.AsNoTracking()
            .Where(p => p.TenantId == _currentTenant.TenantId);

        if (!_currentTenant.Permissions.Contains(Permissions.PhManage))
        {
            var userId = TenantGuard.RequireUserId(_currentTenant);
            var memberPhIds = await _db.UserPropertyMemberships.AsNoTracking()
                .Where(m => m.UserId == userId && m.IsActive)
                .Select(m => m.PropertyHorizontalId)
                .ToListAsync(cancellationToken);
            query = query.Where(p => memberPhIds.Contains(p.Id));
        }

        var phs = await query.OrderBy(p => p.Name).ToListAsync(cancellationToken);

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
            AuditEventType.PhCreated,
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
        EnsurePhNotInactiveForMutation(ph);
        EnsureConcurrency(ph.ConcurrencyStamp, request.ConcurrencyStamp, "PH_CONCURRENCY");

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new DomainException("PH_NAME_REQUIRED", "Name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.TimeZoneId))
        {
            throw new DomainException("PH_TIMEZONE_REQUIRED", "Time zone is required.");
        }

        // Name/legal changes must never alter TenantId, OrganizationId, or Code (identity).
        ph.Name = request.Name.Trim();
        ph.LegalName = PhOnboardingSupport.Trim(request.LegalName);
        ph.Country = PhOnboardingSupport.Trim(request.Country);
        ph.StateProvince = PhOnboardingSupport.Trim(request.StateProvince);
        ph.City = PhOnboardingSupport.Trim(request.City);
        ph.Address = PhOnboardingSupport.Trim(request.Address);
        ph.TimeZoneId = request.TimeZoneId.Trim();
        ph.AdminEmail = PhOnboardingSupport.Trim(request.AdminEmail);
        ph.Phone = PhOnboardingSupport.Trim(request.Phone);
        ph.ConcurrencyStamp = Guid.NewGuid().ToString("N");

        if (request.OnboardingStep is int step)
        {
            ph.OnboardingStep = Math.Clamp(step, 1, 8);
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.PhUpdated,
            correlationId: ph.Id,
            metadata: new { ph.Code, ph.Name, ph.OnboardingStep },
            cancellationToken: cancellationToken);
        return ToDetail(ph);
    }

    public async Task<PhDetailDto> DeactivatePhAsync(
        Guid propertyHorizontalId,
        DeactivateEntityRequest? request = null,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: true, cancellationToken);
        if (ph.Status == PhLifecycleStatus.Inactive)
        {
            return ToDetail(ph);
        }

        ph.StatusBeforeDeactivate = ph.Status;
        ph.Status = PhLifecycleStatus.Inactive;
        ph.ConcurrencyStamp = Guid.NewGuid().ToString("N");
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.PhDeactivated,
            correlationId: ph.Id,
            metadata: new { ph.Code, ph.Name, reason = request?.Reason },
            cancellationToken: cancellationToken);
        return ToDetail(ph);
    }

    public async Task<PhDetailDto> ReactivatePhAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: true, cancellationToken);
        if (ph.Status != PhLifecycleStatus.Inactive)
        {
            return ToDetail(ph);
        }

        ph.Status = ph.StatusBeforeDeactivate ?? PhLifecycleStatus.Draft;
        if (ph.Status == PhLifecycleStatus.Inactive)
        {
            ph.Status = PhLifecycleStatus.Draft;
        }

        ph.StatusBeforeDeactivate = null;
        ph.ConcurrencyStamp = Guid.NewGuid().ToString("N");
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.PhReactivated,
            correlationId: ph.Id,
            metadata: new { ph.Code, ph.Name, restored = ph.Status.ToString() },
            cancellationToken: cancellationToken);
        return ToDetail(ph);
    }

    public async Task<EntityDeleteEvaluationDto> EvaluatePhDeleteAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        var deps = await CollectPhDependenciesAsync(propertyHorizontalId, cancellationToken);
        var blockers = new List<string>();

        // Legal / evidentiary history only — Draft/Scheduled assemblies without votes may be purged.
        if (deps.GetValueOrDefault("votes") > 0)
        {
            blockers.Add("Existen votos registrados vinculados a este PH.");
        }

        if (deps.GetValueOrDefault("recordings") > 0)
        {
            blockers.Add("Existen grabaciones vinculadas a este PH.");
        }

        if (deps.GetValueOrDefault("quorumSnapshots") > 0)
        {
            blockers.Add("Existen snapshots de quórum históricos.");
        }

        if (deps.GetValueOrDefault("completedAssemblies") > 0)
        {
            blockers.Add($"{ph.Name} tiene asambleas finalizadas o en curso. Usa Archivar para conservar el expediente.");
        }

        var canDelete = blockers.Count == 0;
        var assemblyCount = deps.GetValueOrDefault("assemblies");
        var summary = canDelete
            ? assemblyCount > 0
                ? $"Este PH puede eliminarse. Se borrarán también {assemblyCount} asamblea(s) sin historial de votos/grabaciones."
                : "Este PH puede eliminarse de forma permanente."
            : "NO SE PUEDE ELIMINAR ESTE PH";

        return new EntityDeleteEvaluationDto(
            canDelete,
            summary,
            canDelete ? "DELETE" : "DEACTIVATE",
            blockers,
            deps);
    }

    public async Task DeletePhAsync(Guid propertyHorizontalId, CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var evaluation = await EvaluatePhDeleteAsync(propertyHorizontalId, cancellationToken);
        if (!evaluation.CanHardDelete)
        {
            throw new DomainException(
                "PH_DELETE_BLOCKED",
                evaluation.Summary + " " + string.Join(" ", evaluation.BlockingReasons)
                + " Puedes archivarlo sin perder su historial.");
        }

        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: true, cancellationToken);

        await PurgeAssembliesForPhAsync(propertyHorizontalId, cancellationToken);
        await PurgePhScopedCommunicationsAsync(propertyHorizontalId, cancellationToken);

        var unitIds = await _db.Units.Where(u => u.PropertyHorizontalId == propertyHorizontalId).Select(u => u.Id).ToListAsync(cancellationToken);
        var ownerships = await _db.Ownerships.Where(o => unitIds.Contains(o.UnitId)).ToListAsync(cancellationToken);
        _db.Ownerships.RemoveRange(ownerships);

        var invitations = await _db.OwnerInvitations.Where(i => i.PropertyHorizontalId == propertyHorizontalId).ToListAsync(cancellationToken);
        _db.OwnerInvitations.RemoveRange(invitations);

        var memberships = await _db.UserPropertyMemberships.Where(m => m.PropertyHorizontalId == propertyHorizontalId).ToListAsync(cancellationToken);
        _db.UserPropertyMemberships.RemoveRange(memberships);

        var units = await _db.Units.Where(u => u.PropertyHorizontalId == propertyHorizontalId).ToListAsync(cancellationToken);
        _db.Units.RemoveRange(units);

        var orphanOwners = await _db.Owners
            .Where(o => o.RegisteredPropertyHorizontalId == propertyHorizontalId)
            .ToListAsync(cancellationToken);
        foreach (var owner in orphanOwners)
        {
            var otherLinks = await _db.Ownerships.AnyAsync(o => o.OwnerId == owner.Id, cancellationToken);
            if (!otherLinks && owner.UserId is null)
            {
                _db.Owners.Remove(owner);
            }
            else
            {
                owner.RegisteredPropertyHorizontalId = null;
            }
        }

        _db.PropertyHorizontals.Remove(ph);
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.PhDeleted,
            correlationId: propertyHorizontalId,
            metadata: new { ph.Code, ph.Name },
            cancellationToken: cancellationToken);
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
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        EnsurePhNotInactiveForMutation(ph);

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

        var ownershipRows = await (
            from o in _db.Owners.AsNoTracking()
            join own in _db.Ownerships.AsNoTracking() on o.Id equals own.OwnerId
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where u.PropertyHorizontalId == propertyHorizontalId
            select new { Owner = o, Ownership = own, Unit = u })
            .ToListAsync(cancellationToken);

        var registeredOwners = await _db.Owners.AsNoTracking()
            .Where(o => o.RegisteredPropertyHorizontalId == propertyHorizontalId)
            .ToListAsync(cancellationToken);

        if (!string.IsNullOrWhiteSpace(query.Tower))
        {
            var tower = query.Tower.Trim();
            ownershipRows = ownershipRows
                .Where(r => string.Equals(r.Unit.Tower, tower, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        if (query.Floor is int floor)
        {
            ownershipRows = ownershipRows.Where(r => r.Unit.Floor == floor).ToList();
        }

        var byOwner = ownershipRows
            .GroupBy(r => r.Owner.Id)
            .ToDictionary(g => g.Key, g => g.ToList());

        var owners = new Dictionary<Guid, Domain.Entities.Owner>();
        foreach (var row in ownershipRows)
        {
            owners[row.Owner.Id] = row.Owner;
        }

        foreach (var owner in registeredOwners)
        {
            owners.TryAdd(owner.Id, owner);
        }

        var ownerIds = owners.Keys.ToList();
        var now = DateTimeOffset.UtcNow;
        var invitations = await _db.OwnerInvitations.AsNoTracking()
            .Where(i => i.PropertyHorizontalId == propertyHorizontalId && ownerIds.Contains(i.OwnerId))
            .Select(i => new { i.OwnerId, i.ExpiresAtUtc, i.ConsumedAtUtc })
            .ToListAsync(cancellationToken);
        var invitationsByOwner = invitations.GroupBy(i => i.OwnerId).ToDictionary(g => g.Key, g => g.ToList());

        var userIds = owners.Values.Where(o => o.UserId is not null).Select(o => o.UserId!.Value).Distinct().ToList();
        var memberships = userIds.Count == 0
            ? []
            : await _db.UserPropertyMemberships.AsNoTracking()
                .Where(m => m.PropertyHorizontalId == propertyHorizontalId && userIds.Contains(m.UserId))
                .ToListAsync(cancellationToken);
        var membershipByUser = memberships.ToDictionary(m => m.UserId);

        var items = owners.Values.Select(owner =>
        {
            byOwner.TryGetValue(owner.Id, out var links);
            links ??= [];
            var activeLinks = links.Where(x => x.Ownership.IsActive).ToList();
            var unitCodes = activeLinks
                .Select(x => x.Unit.Code)
                .Distinct()
                .OrderBy(c => c, StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (unitCodes.Count == 0 && links.Count > 0)
            {
                unitCodes = links.Select(x => x.Unit.Code).Distinct()
                    .OrderBy(c => c, StringComparer.OrdinalIgnoreCase).ToList();
            }

            var coeff = CoefficientValidator.Normalize(
                activeLinks.Sum(x => x.Unit.CoefficientPercent * x.Ownership.SharePercent / 100m));

            invitationsByOwner.TryGetValue(owner.Id, out var invRows);
            UserPropertyMembership? membership = null;
            if (owner.UserId is Guid uid)
            {
                membershipByUser.TryGetValue(uid, out membership);
            }

            var (access, expires) = ResolvePlatformAccess(owner, membership, invRows?.Select(i => (i.ExpiresAtUtc, i.ConsumedAtUtc)).ToList(), now);

            return new OwnerListItemDto(
                owner.Id,
                owner.DisplayName,
                owner.Email,
                owner.Identification,
                owner.Status.ToString(),
                unitCodes,
                coeff,
                owner.UserId is not null,
                !string.IsNullOrWhiteSpace(owner.Email),
                owner.UserId,
                access,
                expires);
        }).ToList();

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

        if (!string.IsNullOrWhiteSpace(query.AccessStatus))
        {
            var access = query.AccessStatus.Trim();
            items = items.Where(o => string.Equals(o.PlatformAccessStatus, access, StringComparison.OrdinalIgnoreCase)).ToList();
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
        await EnsureOwnerInPhAsync(propertyHorizontalId, ownerId, cancellationToken);

        var owner = await LoadOwnerAsync(ownerId, cancellationToken);
        var links = await LoadOwnerUnitLinksAsync(propertyHorizontalId, ownerId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var invRows = await _db.OwnerInvitations.AsNoTracking()
            .Where(i => i.PropertyHorizontalId == propertyHorizontalId && i.OwnerId == ownerId)
            .Select(i => new { i.ExpiresAtUtc, i.ConsumedAtUtc })
            .ToListAsync(cancellationToken);
        UserPropertyMembership? membership = null;
        if (owner.UserId is Guid uid)
        {
            membership = await _db.UserPropertyMemberships.AsNoTracking()
                .FirstOrDefaultAsync(
                    m => m.UserId == uid && m.PropertyHorizontalId == propertyHorizontalId,
                    cancellationToken);
        }

        var (access, expires) = ResolvePlatformAccess(
            owner,
            membership,
            invRows.Select(i => (i.ExpiresAtUtc, i.ConsumedAtUtc)).ToList(),
            now);
        return ToOwnerDetail(owner, links, access, expires, membership?.IsActive == true);
    }

    public async Task<OwnerDetailDto> CreateOwnerAsync(
        Guid propertyHorizontalId,
        CreateOwnerRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAdministrationAsync(propertyHorizontalId, cancellationToken);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        EnsurePhNotInactiveForMutation(ph);

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
                Status = OwnerLifecycleStatus.Draft,
                RegisteredPropertyHorizontalId = propertyHorizontalId,
                ConcurrencyStamp = Guid.NewGuid().ToString("N")
            };
            _db.Owners.Add(owner);
        }
        else
        {
            TenantGuard.EnsureTenantMatch(_currentTenant, owner.TenantId);
            owner.RegisteredPropertyHorizontalId ??= propertyHorizontalId;
        }

        if (request.UnitId is Guid unitId)
        {
            var unit = await LoadUnitInPhAsync(propertyHorizontalId, unitId, cancellationToken);
            var sharePercent = request.SharePercent ?? 100m;
            if (sharePercent <= 0 || sharePercent > 100)
            {
                throw new DomainException("SHARE_PERCENT_INVALID", "SharePercent must be greater than 0 and at most 100.");
            }

            await UpsertOwnershipAsync(unit, owner.Id, sharePercent, null, cancellationToken);
            await EnsureActiveShareTotalAsync(unit.Id, excludeOwnershipId: null, cancellationToken);
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.OwnerCreated,
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
        await EnsurePhAdministrationAsync(propertyHorizontalId, cancellationToken);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        EnsurePhNotInactiveForMutation(ph);

        var owner = await _db.Owners.FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, owner.TenantId);
        await EnsureOwnerInPhAsync(propertyHorizontalId, ownerId, cancellationToken);
        EnsureConcurrency(owner.ConcurrencyStamp, request.ConcurrencyStamp, "OWNER_CONCURRENCY");

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
        owner.ConcurrencyStamp = Guid.NewGuid().ToString("N");

        // Status changes go through dedicated deactivate/reactivate endpoints for audit clarity,
        // but keep UpdateOwner Status for backwards compatibility (ignored for Inactive→Active).
        if (!string.IsNullOrWhiteSpace(request.Status)
            && Enum.TryParse<OwnerLifecycleStatus>(request.Status, ignoreCase: true, out var status)
            && status is not (OwnerLifecycleStatus.Inactive or OwnerLifecycleStatus.Active))
        {
            owner.Status = status;
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.OwnerUpdated,
            correlationId: owner.Id,
            metadata: new { propertyHorizontalId, owner.Email, owner.Status },
            cancellationToken: cancellationToken);

        var links = await LoadOwnerUnitLinksAsync(propertyHorizontalId, owner.Id, cancellationToken);
        return ToOwnerDetail(owner, links);
    }

    public async Task<OwnerDetailDto> DeactivateOwnerAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        DeactivateEntityRequest? request = null,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAdministrationAsync(propertyHorizontalId, cancellationToken);
        await EnsureOwnerInPhAsync(propertyHorizontalId, ownerId, cancellationToken);

        var owner = await _db.Owners.FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, owner.TenantId);

        owner.Status = OwnerLifecycleStatus.Inactive;
        owner.ConcurrencyStamp = Guid.NewGuid().ToString("N");

        // End active ownerships in this PH only — preserves other PH memberships / User identity.
        var activeInPh = await (
            from own in _db.Ownerships
            join u in _db.Units on own.UnitId equals u.Id
            where own.OwnerId == ownerId && own.IsActive && u.PropertyHorizontalId == propertyHorizontalId
            select own).ToListAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        foreach (var ownership in activeInPh)
        {
            ownership.IsActive = false;
            ownership.EffectiveToUtc = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.OwnerDeactivated,
            correlationId: owner.Id,
            metadata: new { propertyHorizontalId, reason = request?.Reason, endedOwnerships = activeInPh.Count },
            cancellationToken: cancellationToken);

        var links = await LoadOwnerUnitLinksAsync(propertyHorizontalId, owner.Id, cancellationToken);
        return ToOwnerDetail(owner, links);
    }

    public async Task<OwnerDetailDto> ReactivateOwnerAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAdministrationAsync(propertyHorizontalId, cancellationToken);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        EnsurePhNotInactiveForMutation(ph);
        await EnsureOwnerInPhAsync(propertyHorizontalId, ownerId, cancellationToken);

        var owner = await _db.Owners.FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, owner.TenantId);

        // Do not duplicate Owner / User — only flip lifecycle status.
        owner.Status = owner.UserId is null ? OwnerLifecycleStatus.Draft : OwnerLifecycleStatus.Active;
        owner.ConcurrencyStamp = Guid.NewGuid().ToString("N");
        owner.RegisteredPropertyHorizontalId ??= propertyHorizontalId;
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.OwnerReactivated,
            correlationId: owner.Id,
            metadata: new { propertyHorizontalId, owner.Status },
            cancellationToken: cancellationToken);

        var links = await LoadOwnerUnitLinksAsync(propertyHorizontalId, owner.Id, cancellationToken);
        return ToOwnerDetail(owner, links);
    }

    public async Task<EntityDeleteEvaluationDto> EvaluateOwnerDeleteAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        await EnsureOwnerInPhAsync(propertyHorizontalId, ownerId, cancellationToken);
        var owner = await LoadOwnerAsync(ownerId, cancellationToken);
        var deps = await CollectOwnerDependenciesAsync(propertyHorizontalId, owner, cancellationToken);
        var blockers = new List<string>();
        if (deps.GetValueOrDefault("attendance") > 0
            || deps.GetValueOrDefault("votes") > 0
            || deps.GetValueOrDefault("participants") > 0
            || deps.GetValueOrDefault("powers") > 0
            || deps.GetValueOrDefault("representations") > 0)
        {
            blockers.Add("El propietario participó en asambleas históricas. Debe desactivarse, no eliminarse.");
        }

        var canDelete = blockers.Count == 0;
        return new EntityDeleteEvaluationDto(
            canDelete,
            canDelete
                ? "Este propietario no tiene historial de asamblea y puede eliminarse de forma segura."
                : "NO SE PUEDE ELIMINAR ESTE PROPIETARIO",
            canDelete ? "DELETE" : "DEACTIVATE",
            blockers,
            deps);
    }

    public async Task DeleteOwnerAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAdministrationAsync(propertyHorizontalId, cancellationToken);
        var evaluation = await EvaluateOwnerDeleteAsync(propertyHorizontalId, ownerId, cancellationToken);
        if (!evaluation.CanHardDelete)
        {
            throw new DomainException(
                "OWNER_DELETE_BLOCKED",
                evaluation.Summary + " " + string.Join(" ", evaluation.BlockingReasons)
                + " Puedes desactivarlo sin perder el historial.");
        }

        var owner = await _db.Owners.FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, owner.TenantId);

        var ownershipsInPh = await (
            from own in _db.Ownerships
            join u in _db.Units on own.UnitId equals u.Id
            where own.OwnerId == ownerId && u.PropertyHorizontalId == propertyHorizontalId
            select own).ToListAsync(cancellationToken);
        _db.Ownerships.RemoveRange(ownershipsInPh);

        var invitations = await _db.OwnerInvitations
            .Where(i => i.OwnerId == ownerId && i.PropertyHorizontalId == propertyHorizontalId)
            .ToListAsync(cancellationToken);
        _db.OwnerInvitations.RemoveRange(invitations);

        var remainingOwnerships = await _db.Ownerships.AnyAsync(o => o.OwnerId == ownerId, cancellationToken);
        if (remainingOwnerships)
        {
            if (owner.RegisteredPropertyHorizontalId == propertyHorizontalId)
            {
                owner.RegisteredPropertyHorizontalId = null;
            }

            await _db.SaveChangesAsync(cancellationToken);
            await _audit.WriteAsync(
                AuditEventType.OwnershipChanged,
                correlationId: ownerId,
                metadata: new { propertyHorizontalId, action = "removed-from-ph" },
                cancellationToken: cancellationToken);
            return;
        }

        _db.Owners.Remove(owner);
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.OwnerDeleted,
            correlationId: ownerId,
            metadata: new { propertyHorizontalId, owner.Email },
            cancellationToken: cancellationToken);
    }

    public async Task<OwnerUnitLinkDto> CreateOwnershipAsync(
        Guid propertyHorizontalId,
        CreateOwnershipRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        EnsurePhNotInactiveForMutation(ph);

        var unit = await LoadUnitInPhAsync(propertyHorizontalId, request.UnitId, cancellationToken);
        await EnsureOwnerInPhAsync(propertyHorizontalId, request.OwnerId, cancellationToken);
        var owner = await LoadOwnerAsync(request.OwnerId, cancellationToken);

        if (request.SharePercent <= 0 || request.SharePercent > 100)
        {
            throw new DomainException("SHARE_PERCENT_INVALID", "SharePercent must be greater than 0 and at most 100.");
        }

        var ownership = await UpsertOwnershipAsync(
            unit, request.OwnerId, request.SharePercent, request.EffectiveFromUtc, cancellationToken);
        await EnsureActiveShareTotalAsync(unit.Id, excludeOwnershipId: null, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.OwnershipCreated,
            correlationId: ownership.Id,
            metadata: new { propertyHorizontalId, request.UnitId, request.OwnerId, request.SharePercent },
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
            AuditEventType.OwnershipEnded,
            correlationId: ownership.Id,
            metadata: new { propertyHorizontalId, ownership.UnitId, ownership.OwnerId },
            cancellationToken: cancellationToken);
    }

    public async Task<OwnershipTransferResultDto> TransferOwnershipAsync(
        Guid propertyHorizontalId,
        TransferOwnershipRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        EnsurePhNotInactiveForMutation(ph);

        var from = await _db.Ownerships.FirstOrDefaultAsync(o => o.Id == request.FromOwnershipId, cancellationToken)
            ?? throw new DomainException("OWNERSHIP_NOT_FOUND", "No encontramos la titularidad de origen.");
        TenantGuard.EnsureTenantMatch(_currentTenant, from.TenantId);
        if (!from.IsActive)
        {
            throw new DomainException("OWNERSHIP_INACTIVE", "La titularidad de origen ya no está activa.");
        }

        var unit = await LoadUnitInPhAsync(propertyHorizontalId, from.UnitId, cancellationToken);
        await EnsureOwnerInPhAsync(propertyHorizontalId, request.ToOwnerId, cancellationToken);
        var toOwner = await LoadOwnerAsync(request.ToOwnerId, cancellationToken);
        var fromOwner = await LoadOwnerAsync(from.OwnerId, cancellationToken);

        if (request.ToOwnerId == from.OwnerId)
        {
            throw new DomainException("OWNERSHIP_TRANSFER_SAME", "El nuevo propietario debe ser distinto al actual.");
        }

        var share = request.SharePercent ?? from.SharePercent;
        if (share <= 0 || share > 100)
        {
            throw new DomainException("SHARE_PERCENT_INVALID", "SharePercent must be greater than 0 and at most 100.");
        }

        var effectiveFrom = request.EffectiveFromUtc ?? DateTimeOffset.UtcNow;
        // Allow tiny client/server clock skew; reject meaningfully earlier dates.
        if (effectiveFrom < from.EffectiveFromUtc.AddSeconds(-5))
        {
            throw new DomainException(
                "OWNERSHIP_EFFECTIVE_INVALID",
                "La fecha efectiva no puede ser anterior al inicio de la titularidad actual.");
        }

        if (effectiveFrom < from.EffectiveFromUtc)
        {
            effectiveFrom = from.EffectiveFromUtc;
        }

        // Close old ownership (preserve row).
        from.IsActive = false;
        from.EffectiveToUtc = effectiveFrom;

        // Create/reactivate destination ownership with transferred share.
        var existingTo = await _db.Ownerships.FirstOrDefaultAsync(
            o => o.UnitId == unit.Id && o.OwnerId == request.ToOwnerId, cancellationToken);
        Ownership created;
        if (existingTo is not null)
        {
            if (existingTo.IsActive)
            {
                throw new DomainException(
                    "OWNERSHIP_DUPLICATE",
                    "El nuevo propietario ya tiene titularidad activa en esta unidad. Finalízala o ajusta copropiedad.");
            }

            existingTo.IsActive = true;
            existingTo.SharePercent = CoefficientValidator.Normalize(share);
            existingTo.EffectiveFromUtc = effectiveFrom;
            existingTo.EffectiveToUtc = null;
            created = existingTo;
        }
        else
        {
            created = new Ownership
            {
                TenantId = _currentTenant.TenantId,
                UnitId = unit.Id,
                OwnerId = request.ToOwnerId,
                SharePercent = CoefficientValidator.Normalize(share),
                EffectiveFromUtc = effectiveFrom,
                IsActive = true
            };
            _db.Ownerships.Add(created);
        }

        await EnsureActiveShareTotalAsync(unit.Id, excludeOwnershipId: null, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.OwnershipTransferred,
            correlationId: unit.Id,
            metadata: new
            {
                propertyHorizontalId,
                unitId = unit.Id,
                fromOwnershipId = from.Id,
                toOwnershipId = created.Id,
                fromOwnerId = from.OwnerId,
                toOwnerId = request.ToOwnerId,
                share,
                reason = request.Reason
            },
            cancellationToken: cancellationToken);

        return new OwnershipTransferResultDto(
            from.Id,
            created.Id,
            unit.Id,
            unit.Code,
            from.OwnerId,
            OwnerDisplay(fromOwner),
            request.ToOwnerId,
            OwnerDisplay(toOwner),
            created.SharePercent,
            effectiveFrom);
    }

    public async Task<UnitOwnershipDetailDto> GetUnitOwnershipDetailAsync(
        Guid propertyHorizontalId,
        Guid unitId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);
        var unit = await LoadUnitInPhAsync(propertyHorizontalId, unitId, cancellationToken);

        var rows = await (
            from own in _db.Ownerships.AsNoTracking()
            join o in _db.Owners.AsNoTracking() on own.OwnerId equals o.Id
            where own.UnitId == unit.Id
            orderby own.IsActive descending, own.EffectiveFromUtc descending
            select new { Ownership = own, Owner = o }
        ).ToListAsync(cancellationToken);

        var links = rows.Select(r => new UnitOwnerLinkDto(
            r.Ownership.Id,
            r.Owner.Id,
            OwnerDisplay(r.Owner),
            r.Owner.Email,
            r.Ownership.SharePercent,
            r.Ownership.IsActive,
            r.Ownership.EffectiveFromUtc,
            r.Ownership.EffectiveToUtc)).ToList();

        var activeTotal = CoefficientValidator.Normalize(
            links.Where(x => x.IsActive).Sum(x => x.SharePercent));
        var missing = activeTotal >= 100m
            ? 0m
            : CoefficientValidator.Normalize(100m - activeTotal);
        // Complete only when active share totals ~100% (not when over-assigned).
        var ownershipComplete = activeTotal >= 99.9999m && activeTotal <= 100.0001m;
        return new UnitOwnershipDetailDto(
            unit.Id,
            unit.Code,
            unit.Tower,
            unit.Floor,
            unit.CoefficientPercent,
            unit.IsActive,
            activeTotal,
            ownershipComplete,
            missing,
            links);
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

    public async Task<MyOwnerProfileDto> GetMyOwnerProfileAsync(CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var owners = await _db.Owners.AsNoTracking()
            .Where(o => o.UserId == userId && o.TenantId == _currentTenant.TenantId)
            .ToListAsync(cancellationToken);

        var displayName = owners.FirstOrDefault()?.DisplayName
                          ?? _currentTenant.DisplayName
                          ?? "Propietario";
        var email = owners.FirstOrDefault()?.Email ?? string.Empty;
        var phone = owners.FirstOrDefault()?.Phone;

        var ownerIds = owners.Select(o => o.Id).ToList();
        var units = await (
            from own in _db.Ownerships.AsNoTracking()
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            join p in _db.PropertyHorizontals.AsNoTracking() on u.PropertyHorizontalId equals p.Id
            where ownerIds.Contains(own.OwnerId) && own.IsActive
            orderby p.Name, u.Code
            select new MyOwnerUnitDto(
                u.Code,
                u.Tower,
                own.SharePercent,
                u.CoefficientPercent,
                p.Name,
                own.IsActive))
            .ToListAsync(cancellationToken);

        var memberships = await ListMembershipsMarkingCurrentAsync(
            userId,
            _currentTenant.PropertyHorizontalId ?? Guid.Empty,
            cancellationToken);

        return new MyOwnerProfileDto(displayName, email, phone, units, memberships);
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
        if (!hasMembership && !_currentTenant.Permissions.Contains(Permissions.PhManage))
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

    private async Task EnsurePhAdministrationAsync(Guid propertyHorizontalId, CancellationToken cancellationToken)
    {
        await EnsurePhAccessAsync(propertyHorizontalId, track: false, cancellationToken);

        if (_currentTenant.Permissions.Contains(Permissions.PhManage)
            || _currentTenant.Permissions.Contains(Permissions.OwnerManage)
            || _currentTenant.Permissions.Contains(Permissions.UnitManage))
        {
            return;
        }

        var userId = TenantGuard.RequireUserId(_currentTenant);
        var isLocalPhAdmin = await _db.UserPropertyMemberships.AsNoTracking().AnyAsync(
            m => m.UserId == userId
                 && m.PropertyHorizontalId == propertyHorizontalId
                 && m.IsActive
                 && (m.RoleHint == Roles.PHAdmin
                     || m.RoleHint == Roles.TenantAdmin
                     || m.RoleHint == Roles.PlatformAdmin),
            cancellationToken);

        if (!isLocalPhAdmin)
        {
            throw new DomainException(
                "FORBIDDEN",
                "Forbidden: se requiere Administrador PH para administrar propietarios/unidades de esta propiedad.");
        }
    }

    private async Task<PropertyHorizontal> EnsurePhAccessAsync(Guid propertyHorizontalId, bool track, CancellationToken cancellationToken)
    {
        var query = track ? _db.PropertyHorizontals.AsQueryable() : _db.PropertyHorizontals.AsNoTracking();
        var ph = await query.FirstOrDefaultAsync(p => p.Id == propertyHorizontalId, cancellationToken)
            ?? throw new DomainException("PH_NOT_FOUND", "Property horizontal not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, ph.TenantId);

        // Tenant-wide PH admins may access any PH in tenant.
        if (_currentTenant.Permissions.Contains(Permissions.PhManage))
        {
            return ph;
        }

        // Everyone else (including ph:view operators and portal:self owners) needs membership.
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var hasMembership = await _db.UserPropertyMemberships.AsNoTracking().AnyAsync(
            m => m.UserId == userId && m.PropertyHorizontalId == propertyHorizontalId && m.IsActive,
            cancellationToken);
        if (!hasMembership)
        {
            throw new DomainException("PH_ACCESS_DENIED", "No tienes acceso a esta propiedad horizontal.");
        }

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
        ph.TimeZoneId, ph.AdminEmail, ph.Phone, ph.Status.ToString(), ph.OnboardingStep, ph.ConcurrencyStamp);

    private static UnitDto ToUnitDto(Unit u) =>
        new(u.Id, u.PropertyHorizontalId, u.Code, u.Tower, u.Floor, u.UnitType, u.CoefficientPercent, u.IsActive);

    private static OwnerDetailDto ToOwnerDetail(
        Owner owner,
        IReadOnlyList<OwnerUnitLinkDto> links,
        string platformAccessStatus = "NotInvited",
        DateTimeOffset? invitationExpiresAtUtc = null,
        bool phAccessActive = false) => new(
        owner.Id,
        owner.DisplayName,
        owner.FirstName,
        owner.LastName,
        owner.IdentificationType,
        owner.Identification,
        owner.Email,
        owner.Phone,
        owner.Status.ToString(),
        owner.UserId,
        owner.ConcurrencyStamp,
        links,
        platformAccessStatus,
        invitationExpiresAtUtc,
        phAccessActive);

    private static (string Status, DateTimeOffset? ExpiresAtUtc) ResolvePlatformAccess(
        Owner owner,
        UserPropertyMembership? membership,
        IReadOnlyList<(DateTimeOffset ExpiresAtUtc, DateTimeOffset? ConsumedAtUtc)>? invitations,
        DateTimeOffset now)
    {
        if (membership is not null && !membership.IsActive)
        {
            return ("AccessSuspended", null);
        }

        if (owner.UserId is not null && membership is { IsActive: true })
        {
            return ("Active", null);
        }

        if (invitations is { Count: > 0 })
        {
            var pending = invitations
                .Where(i => i.ConsumedAtUtc is null && i.ExpiresAtUtc > now)
                .OrderByDescending(i => i.ExpiresAtUtc)
                .FirstOrDefault();
            if (pending.ExpiresAtUtc > now)
            {
                return ("InvitationPending", pending.ExpiresAtUtc);
            }

            var expired = invitations
                .Where(i => i.ConsumedAtUtc is null)
                .OrderByDescending(i => i.ExpiresAtUtc)
                .FirstOrDefault();
            if (expired.ExpiresAtUtc != default)
            {
                return ("InvitationExpired", expired.ExpiresAtUtc);
            }
        }

        return ("NotInvited", null);
    }

    private static void EnsurePhNotInactiveForMutation(PropertyHorizontal ph)
    {
        if (ph.Status == PhLifecycleStatus.Inactive)
        {
            throw new DomainException(
                "PH_INACTIVE",
                "Este PH está desactivado. Reactívalo antes de crear o modificar datos operativos.");
        }
    }

    private static void EnsureConcurrency(string current, string? provided, string code)
    {
        if (!string.IsNullOrWhiteSpace(provided) && !string.Equals(current, provided, StringComparison.Ordinal))
        {
            throw new DomainException(code, "Otro usuario modificó este registro. Recarga e inténtalo de nuevo.");
        }
    }

    private async Task EnsureOwnerInPhAsync(Guid propertyHorizontalId, Guid ownerId, CancellationToken cancellationToken)
    {
        var linked = await (
            from own in _db.Ownerships.AsNoTracking()
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where own.OwnerId == ownerId && u.PropertyHorizontalId == propertyHorizontalId
            select own.Id).AnyAsync(cancellationToken);
        if (linked)
        {
            return;
        }

        var registered = await _db.Owners.AsNoTracking().AnyAsync(
            o => o.Id == ownerId && o.RegisteredPropertyHorizontalId == propertyHorizontalId, cancellationToken);
        if (!registered)
        {
            throw new DomainException("OWNER_NOT_IN_PH", "Owner does not belong to this property horizontal.");
        }
    }

    private async Task<Ownership> UpsertOwnershipAsync(
        Unit unit,
        Guid ownerId,
        decimal sharePercent,
        DateTimeOffset? effectiveFromUtc,
        CancellationToken cancellationToken)
    {
        var existing = await _db.Ownerships.FirstOrDefaultAsync(
            o => o.UnitId == unit.Id && o.OwnerId == ownerId, cancellationToken);
        if (existing is not null)
        {
            if (existing.IsActive)
            {
                // Idempotent associate: same owner+unit already active (common on re-save / re-add).
                var normalized = CoefficientValidator.Normalize(sharePercent);
                if (existing.SharePercent != normalized)
                {
                    existing.SharePercent = normalized;
                }

                return existing;
            }

            existing.IsActive = true;
            existing.SharePercent = CoefficientValidator.Normalize(sharePercent);
            existing.EffectiveFromUtc = effectiveFromUtc ?? DateTimeOffset.UtcNow;
            existing.EffectiveToUtc = null;
            return existing;
        }

        var ownership = new Ownership
        {
            TenantId = _currentTenant.TenantId,
            UnitId = unit.Id,
            OwnerId = ownerId,
            SharePercent = CoefficientValidator.Normalize(sharePercent),
            EffectiveFromUtc = effectiveFromUtc ?? DateTimeOffset.UtcNow,
            IsActive = true
        };
        _db.Ownerships.Add(ownership);
        return ownership;
    }

    /// <summary>
    /// Active ownership shares for a unit must not exceed 100%.
    /// Loads from DB then reads EF Local so Added/Modified rows in the same UoW are included.
    /// </summary>
    private async Task EnsureActiveShareTotalAsync(
        Guid unitId,
        Guid? excludeOwnershipId,
        CancellationToken cancellationToken)
    {
        await _db.Ownerships
            .Where(o => o.UnitId == unitId)
            .LoadAsync(cancellationToken);

        var active = _db.Ownerships.Local
            .Where(o => o.UnitId == unitId && o.IsActive)
            .ToList();
        if (excludeOwnershipId is Guid exclude)
        {
            active = active.Where(o => o.Id != exclude).ToList();
        }

        var total = CoefficientValidator.Normalize(active.Sum(o => o.SharePercent));
        if (total > 100.0001m)
        {
            throw new DomainException(
                "OWNERSHIP_SHARE_OVERFLOW",
                $"La titularidad activa de la unidad sumaría {total:0.####}% (máximo 100%). Ajusta los porcentajes.");
        }
    }

    private static string OwnerDisplay(Owner owner)
    {
        var full = $"{owner.FirstName} {owner.LastName}".Trim();
        if (!string.IsNullOrWhiteSpace(full))
        {
            return full;
        }

        if (!string.IsNullOrWhiteSpace(owner.DisplayName))
        {
            return owner.DisplayName.Trim();
        }

        return owner.Email;
    }

    private async Task<Dictionary<string, int>> CollectPhDependenciesAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken)
    {
        var assemblies = await _db.Assemblies.AsNoTracking()
            .Where(a => a.PropertyHorizontalId == propertyHorizontalId)
            .Select(a => new { a.Id, a.Status })
            .ToListAsync(cancellationToken);
        var assemblyIds = assemblies.Select(a => a.Id).ToList();
        var completedAssemblies = assemblies.Count(a =>
            a.Status is AssemblyStatus.Completed
                or AssemblyStatus.InProgress
                or AssemblyStatus.Paused
                or AssemblyStatus.CheckIn);

        var votes = 0;
        var recordings = 0;
        var quorum = 0;
        if (assemblyIds.Count > 0)
        {
            var sessionIds = await _db.VotingSessions.AsNoTracking()
                .Where(s => assemblyIds.Contains(s.AssemblyId))
                .Select(s => s.Id)
                .ToListAsync(cancellationToken);
            votes = sessionIds.Count == 0
                ? 0
                : await _db.Votes.AsNoTracking().CountAsync(v => sessionIds.Contains(v.VotingSessionId), cancellationToken);
            recordings = await _db.AssemblyRecordings.AsNoTracking()
                .CountAsync(r => assemblyIds.Contains(r.AssemblyId), cancellationToken);
            quorum = await _db.QuorumSnapshots.AsNoTracking()
                .CountAsync(q => assemblyIds.Contains(q.AssemblyId), cancellationToken);
        }

        var units = await _db.Units.AsNoTracking().CountAsync(u => u.PropertyHorizontalId == propertyHorizontalId, cancellationToken);
        return new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["assemblies"] = assemblyIds.Count,
            ["completedAssemblies"] = completedAssemblies,
            ["votes"] = votes,
            ["recordings"] = recordings,
            ["quorumSnapshots"] = quorum,
            ["units"] = units
        };
    }

    /// <summary>
    /// Removes Draft/Scheduled/Cancelled assemblies and related rows that block PH deletion (Restrict FKs).
    /// Caller must ensure no legal history (votes/recordings/quorum/completed).
    /// </summary>
    private async Task PurgeAssembliesForPhAsync(Guid propertyHorizontalId, CancellationToken cancellationToken)
    {
        var assemblyIds = await _db.Assemblies
            .Where(a => a.PropertyHorizontalId == propertyHorizontalId)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);
        if (assemblyIds.Count == 0)
        {
            return;
        }

        var sessionIds = await _db.VotingSessions
            .Where(s => assemblyIds.Contains(s.AssemblyId))
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);

        if (sessionIds.Count > 0)
        {
            await _db.Votes.Where(v => sessionIds.Contains(v.VotingSessionId)).ExecuteDeleteAsync(cancellationToken);
            await _db.VotingEligibilitySnapshots.Where(s => sessionIds.Contains(s.VotingSessionId)).ExecuteDeleteAsync(cancellationToken);
            await _db.VotingSessions.Where(s => sessionIds.Contains(s.Id)).ExecuteDeleteAsync(cancellationToken);
        }

        await _db.Motions
            .Where(m => assemblyIds.Contains(m.AssemblyId) && m.PreviousMotionId != null)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.PreviousMotionId, (Guid?)null), cancellationToken);
        await _db.Motions.Where(m => assemblyIds.Contains(m.AssemblyId)).ExecuteDeleteAsync(cancellationToken);

        var convocationIds = await _db.Convocations
            .Where(c => assemblyIds.Contains(c.AssemblyId))
            .Select(c => c.Id)
            .ToListAsync(cancellationToken);
        if (convocationIds.Count > 0)
        {
            var batchIds = await _db.CommunicationBatches
                .Where(b => convocationIds.Contains(b.ConvocationId))
                .Select(b => b.Id)
                .ToListAsync(cancellationToken);
            if (batchIds.Count > 0)
            {
                var deliveryIds = await _db.CommunicationDeliveries
                    .Where(d => batchIds.Contains(d.BatchId))
                    .Select(d => d.Id)
                    .ToListAsync(cancellationToken);
                if (deliveryIds.Count > 0)
                {
                    await _db.CommunicationDeliveryEvents
                        .Where(e => deliveryIds.Contains(e.DeliveryId))
                        .ExecuteDeleteAsync(cancellationToken);
                    await _db.CommunicationDeliveries
                        .Where(d => deliveryIds.Contains(d.Id))
                        .ExecuteDeleteAsync(cancellationToken);
                }

                await _db.CommunicationBatches.Where(b => batchIds.Contains(b.Id)).ExecuteDeleteAsync(cancellationToken);
            }

            await _db.AssemblyAccessLinks
                .Where(l => convocationIds.Contains(l.ConvocationId))
                .ExecuteDeleteAsync(cancellationToken);
            await _db.ConvocationRecipients
                .Where(r => convocationIds.Contains(r.ConvocationId))
                .ExecuteDeleteAsync(cancellationToken);
            await _db.Convocations.Where(c => convocationIds.Contains(c.Id)).ExecuteDeleteAsync(cancellationToken);
        }

        await _db.AssemblyAccessLinks.Where(l => assemblyIds.Contains(l.AssemblyId)).ExecuteDeleteAsync(cancellationToken);
        await _db.AuditEvents
            .Where(a => a.AssemblyId != null && assemblyIds.Contains(a.AssemblyId.Value))
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.AssemblyId, (Guid?)null), cancellationToken);

        await _db.Assemblies.Where(a => assemblyIds.Contains(a.Id)).ExecuteDeleteAsync(cancellationToken);
    }

    private async Task PurgePhScopedCommunicationsAsync(Guid propertyHorizontalId, CancellationToken cancellationToken)
    {
        await _db.PortalNotifications
            .Where(n => n.PropertyHorizontalId == propertyHorizontalId)
            .ExecuteDeleteAsync(cancellationToken);
        await _db.ReminderRules
            .Where(r => r.PropertyHorizontalId == propertyHorizontalId)
            .ExecuteDeleteAsync(cancellationToken);
        await _db.MessageTemplates
            .Where(t => t.PropertyHorizontalId == propertyHorizontalId)
            .ExecuteDeleteAsync(cancellationToken);
        await _db.ChannelConfigurations
            .Where(c => c.PropertyHorizontalId == propertyHorizontalId)
            .ExecuteDeleteAsync(cancellationToken);
        await _db.CommunicationProfiles
            .Where(p => p.PropertyHorizontalId == propertyHorizontalId)
            .ExecuteDeleteAsync(cancellationToken);
    }

    private async Task<Dictionary<string, int>> CollectOwnerDependenciesAsync(
        Guid propertyHorizontalId,
        Owner owner,
        CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["attendance"] = 0,
            ["votes"] = 0,
            ["participants"] = 0,
            ["powers"] = 0,
            ["representations"] = 0,
            ["ownerships"] = await (
                from own in _db.Ownerships.AsNoTracking()
                join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
                where own.OwnerId == owner.Id && u.PropertyHorizontalId == propertyHorizontalId
                select own.Id).CountAsync(cancellationToken)
        };

        if (owner.UserId is not Guid userId)
        {
            return result;
        }

        var assemblyIds = await _db.Assemblies.AsNoTracking()
            .Where(a => a.PropertyHorizontalId == propertyHorizontalId)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);
        if (assemblyIds.Count == 0)
        {
            return result;
        }

        result["participants"] = await _db.AssemblyParticipants.AsNoTracking()
            .CountAsync(p => assemblyIds.Contains(p.AssemblyId) && p.UserId == userId, cancellationToken);
        result["attendance"] = await _db.AttendanceRecords.AsNoTracking()
            .CountAsync(a => assemblyIds.Contains(a.AssemblyId) && a.UserId == userId, cancellationToken);
        result["powers"] = await _db.Powers.AsNoTracking()
            .CountAsync(p => assemblyIds.Contains(p.AssemblyId)
                             && (p.PrincipalOwnerId == owner.Id || p.RepresentativeUserId == userId), cancellationToken);
        result["representations"] = await _db.AssemblyRepresentations.AsNoTracking()
            .CountAsync(r => assemblyIds.Contains(r.AssemblyId) && r.RepresentativeUserId == userId, cancellationToken);

        var sessionIds = await _db.VotingSessions.AsNoTracking()
            .Where(s => assemblyIds.Contains(s.AssemblyId))
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);
        if (sessionIds.Count > 0)
        {
            result["votes"] = await _db.Votes.AsNoTracking()
                .CountAsync(v => sessionIds.Contains(v.VotingSessionId) && v.UserId == userId, cancellationToken);
        }

        return result;
    }
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
