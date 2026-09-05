namespace Asambleas.Application.PhOnboarding;

using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.PhOnboarding;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Multi-sheet PH roster import (units / owners / ownerships) with preview, patch, and all-or-nothing commit.
/// Sessions are in-memory (single process) and expire after <see cref="SessionLifetime"/>.
/// </summary>
public sealed class PhImportService
{
    public const int MaxRows = 5000;
    public const int MaxFileBytes = 5 * 1024 * 1024;
    public const int MaxCellLength = 2000;

    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(1);
    private static readonly ConcurrentDictionary<Guid, ImportSession> Sessions = new();
    private static readonly ConcurrentDictionary<string, PhRosterImportCommitResultDto> Idempotency =
        new(StringComparer.Ordinal);

    private static readonly AssemblyStatus[] LiveAssemblyStatuses =
    [
        AssemblyStatus.CheckIn,
        AssemblyStatus.InProgress,
        AssemblyStatus.Paused
    ];

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IPhImportWorkbookService _workbook;
    private readonly IAuditService _audit;

    public PhImportService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IPhImportWorkbookService workbook,
        IAuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _workbook = workbook;
        _audit = audit;
    }

    public async Task<(byte[] Bytes, string FileName)> BuildTemplateAsync(
        Guid phId,
        CancellationToken cancellationToken = default)
    {
        var ph = await LoadPhAsync(phId, cancellationToken);
        var bytes = _workbook.BuildTemplate(ph.Name);
        var safe = "padron-" + SanitizeFileName(ph.Code) + ".xlsx";
        return (bytes, safe);
    }

    public async Task<PhRosterImportPreviewDto> AnalyzeAsync(
        Guid phId,
        Stream stream,
        string? fileName,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(stream);
        var ph = await LoadPhAsync(phId, cancellationToken);
        EnsureStreamSize(stream);

        var ext = Path.GetExtension(fileName ?? string.Empty).ToLowerInvariant();
        if (ext is ".xlsx" || LooksLikeXlsx(fileName, stream))
        {
            var sheets = _workbook.ParseWorkbookMultiSheet(stream);
            if (sheets.IsMultiSheet)
            {
                return await BuildPreviewFromSheetsAsync(
                    ph, sheets.UnitHeaders, sheets.UnitRows,
                    sheets.OwnerHeaders, sheets.OwnerRows,
                    sheets.RelationHeaders, sheets.RelationRows,
                    fileName, "xlsx", cancellationToken);
            }

            return await BuildPreviewFromLegacyFlatAsync(
                ph, sheets.UnitHeaders, sheets.UnitRows, fileName, "xlsx", cancellationToken);
        }

        if (ext is ".csv" || string.IsNullOrEmpty(ext))
        {
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            var content = (await reader.ReadToEndAsync(cancellationToken)).TrimStart('\uFEFF');
            var table = ParseCsv(content);
            if (table.Count == 0)
            {
                throw new DomainException("IMPORT_FILE_EMPTY", "El archivo no tiene filas.");
            }

            var headers = table[0].Select(h => h.Trim()).ToList();
            var data = table.Skip(1).Where(r => r.Any(c => !string.IsNullOrWhiteSpace(c))).ToList();
            return await BuildPreviewFromCsvAsync(ph, headers, data, fileName, cancellationToken);
        }

        throw new DomainException("IMPORT_BAD_TYPE", "Solo se admiten archivos .xlsx o .csv.");
    }

    public async Task<PhRosterImportPreviewDto> PatchRowAsync(
        Guid phId,
        PhRosterImportPatchRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        await LoadPhAsync(phId, cancellationToken);
        var session = GetSession(request.SessionId, phId);

        var sheet = NormalizeSheet(request.Sheet);
        if (sheet == PhRosterImportSheets.Units)
        {
            var row = session.Units.FirstOrDefault(r => r.RowNumber == request.RowNumber)
                ?? throw new DomainException("IMPORT_ROW_NOT_FOUND", "No encontramos esa fila de unidad en la vista previa.");
            if (request.Code is not null) row.Code = TrimCell(request.Code);
            if (request.Tower is not null) row.Tower = TrimCell(request.Tower);
            if (request.Floor.HasValue) row.Floor = request.Floor;
            if (request.UnitType is not null) row.UnitType = TrimCell(request.UnitType);
            if (request.Coefficient.HasValue) row.Coefficient = request.Coefficient;
            if (request.Estado is not null) row.Estado = TrimCell(request.Estado);
            if (request.Included.HasValue) row.Included = request.Included.Value;
        }
        else if (sheet == PhRosterImportSheets.Owners)
        {
            var row = session.Owners.FirstOrDefault(r => r.RowNumber == request.RowNumber)
                ?? throw new DomainException("IMPORT_ROW_NOT_FOUND", "No encontramos esa fila de propietario en la vista previa.");
            if (request.IdType is not null) row.IdType = TrimCell(request.IdType);
            if (request.Identification is not null) row.Identification = TrimCell(request.Identification);
            if (request.FirstName is not null) row.FirstName = TrimCell(request.FirstName);
            if (request.LastName is not null) row.LastName = TrimCell(request.LastName);
            if (request.DisplayName is not null) row.DisplayName = TrimCell(request.DisplayName);
            if (request.Email is not null) row.Email = TrimCell(request.Email)?.ToLowerInvariant();
            if (request.Phone is not null) row.Phone = TrimCell(request.Phone);
            if (request.Estado is not null) row.Estado = TrimCell(request.Estado);
            if (request.Included.HasValue) row.Included = request.Included.Value;

            // Keep synthesized/legacy relation rows in sync when the owner key changes.
            if (request.Email is not null || request.Identification is not null)
            {
                foreach (var rel in session.Relations.Where(r => r.RowNumber == row.RowNumber))
                {
                    if (request.Email is not null)
                    {
                        rel.Email = row.Email;
                    }

                    if (request.Identification is not null)
                    {
                        rel.Identification = row.Identification;
                    }
                }
            }
        }
        else if (sheet == PhRosterImportSheets.Relations)
        {
            var row = session.Relations.FirstOrDefault(r => r.RowNumber == request.RowNumber)
                ?? throw new DomainException("IMPORT_ROW_NOT_FOUND", "No encontramos esa fila de relación en la vista previa.");
            if (request.Identification is not null) row.Identification = TrimCell(request.Identification);
            if (request.Email is not null) row.Email = TrimCell(request.Email)?.ToLowerInvariant();
            if (request.UnitCode is not null) row.UnitCode = TrimCell(request.UnitCode);
            if (request.SharePercent.HasValue) row.SharePercent = request.SharePercent;
            if (request.Estado is not null) row.Estado = TrimCell(request.Estado);
            if (request.Included.HasValue) row.Included = request.Included.Value;
        }
        else
        {
            throw new DomainException("IMPORT_SHEET_INVALID", "Hoja no válida. Use Units, Owners o Relations.");
        }

        await ValidateSessionAsync(session, cancellationToken);
        return ToPreview(session);
    }

    public async Task<PhRosterImportPreviewDto> ExcludeRowAsync(
        Guid phId,
        PhRosterImportExcludeRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return await PatchRowAsync(
            phId,
            new PhRosterImportPatchRequest(
                request.SessionId,
                request.Sheet,
                request.RowNumber,
                Included: request.Included),
            cancellationToken);
    }

    public async Task<PhRosterImportCommitResultDto> CommitAsync(
        Guid phId,
        PhRosterImportCommitRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var ph = await LoadPhAsync(phId, cancellationToken);

        if (!string.IsNullOrWhiteSpace(request.ClientRequestId))
        {
            var key = phId + ":" + request.ClientRequestId.Trim();
            if (Idempotency.TryGetValue(key, out var prior))
            {
                return prior with { IdempotentReplay = true };
            }
        }

        var session = GetSession(request.SessionId, phId);
        var mode = NormalizeMode(request.Mode);
        session.Mode = mode;

        if (!string.IsNullOrWhiteSpace(request.ConfirmPhName)
            && !string.Equals(request.ConfirmPhName.Trim(), ph.Name, StringComparison.OrdinalIgnoreCase))
        {
            session.ConfirmPhNameWarning =
                $"El nombre confirmado '{request.ConfirmPhName.Trim()}' no coincide con '{ph.Name}'.";
        }

        if (mode == PhRosterImportModes.CreateAndUpdate && !request.ConfirmUpdate)
        {
            throw new DomainException(
                "IMPORT_CONFIRM_UPDATE_REQUIRED",
                "Para crear y actualizar debe confirmar ConfirmUpdate=true.");
        }

        await ValidateSessionAsync(session, cancellationToken);

        if (session.ActiveAssemblyBlocked)
        {
            throw new DomainException(
                "IMPORT_ACTIVE_ASSEMBLY",
                session.ActiveAssemblyMessage
                ?? "Hay una asamblea en curso. No se puede importar el padrón ahora.");
        }

        var includedUnits = session.Units.Where(r => r.Included).ToList();
        var includedOwners = session.Owners.Where(r => r.Included).ToList();
        var includedRelations = session.Relations.Where(r => r.Included).ToList();

        if (includedUnits.Count + includedOwners.Count + includedRelations.Count == 0)
        {
            throw new DomainException("IMPORT_EMPTY", "No hay filas incluidas para importar.");
        }

        if (includedUnits.Any(r => r.Status == "Error")
            || includedOwners.Any(r => r.Status == "Error")
            || includedRelations.Any(r => r.Status == "Error"))
        {
            throw new DomainException("IMPORT_HAS_ERRORS", "Corrija las filas con errores antes de importar.");
        }

        if (_db is not DbContext ef)
        {
            throw new InvalidOperationException("Import requires EF Core DbContext.");
        }

        var tenantId = session.TenantId;
        var unitsCreated = 0;
        var unitsUpdated = 0;
        var ownersCreated = 0;
        var ownersUpdated = 0;
        var ownershipsCreated = 0;
        var createdUnitIds = new List<Guid>();
        var createdOwnerIds = new List<Guid>();
        var createdOwnershipIds = new List<Guid>();

        await using var tx = await ef.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var unitByCode = (await _db.Units
                    .Where(u => u.PropertyHorizontalId == phId)
                    .ToListAsync(cancellationToken))
                .ToDictionary(u => u.Code, StringComparer.OrdinalIgnoreCase);

            var existingOwners = await _db.Owners
                .Where(o => o.TenantId == tenantId)
                .ToListAsync(cancellationToken);
            var ownerByEmail = existingOwners.ToDictionary(o => o.Email, StringComparer.OrdinalIgnoreCase);
            var ownerByIdentification = new Dictionary<string, Owner>(StringComparer.OrdinalIgnoreCase);
            foreach (var owner in existingOwners)
            {
                if (!string.IsNullOrWhiteSpace(owner.Identification))
                {
                    ownerByIdentification.TryAdd(owner.Identification.Trim(), owner);
                }
            }

            var unitIdsForOwnership = unitByCode.Values.Select(u => u.Id).ToList();
            var existingOwnerships = unitIdsForOwnership.Count == 0
                ? []
                : await _db.Ownerships
                    .Where(o => o.TenantId == tenantId && unitIdsForOwnership.Contains(o.UnitId))
                    .ToListAsync(cancellationToken);
            // Reload after potential new units — track by (UnitId, OwnerId)
            var ownershipKeys = new HashSet<(Guid UnitId, Guid OwnerId)>(
                existingOwnerships.Select(o => (o.UnitId, o.OwnerId)));

            foreach (var row in includedUnits.OrderBy(r => r.RowNumber))
            {
                if (row.Classification is "Error")
                {
                    continue;
                }

                var code = row.Code!.Trim();
                if (!unitByCode.TryGetValue(code, out var unit))
                {
                    if (row.Classification is "Existente" or "Actualizacion")
                    {
                        continue;
                    }

                    unit = new Unit
                    {
                        TenantId = tenantId,
                        PropertyHorizontalId = phId,
                        Code = code,
                        Tower = PhOnboardingSupport.Trim(row.Tower),
                        Floor = row.Floor,
                        UnitType = PhOnboardingSupport.Trim(row.UnitType),
                        CoefficientPercent = CoefficientValidator.Normalize(row.Coefficient ?? 0m),
                        IsActive = ResolveUnitActive(row.Estado) ?? true
                    };
                    _db.Units.Add(unit);
                    unitByCode[code] = unit;
                    unitsCreated++;
                    createdUnitIds.Add(unit.Id);
                }
                else if (mode == PhRosterImportModes.CreateAndUpdate
                         && row.Classification == "Actualizacion")
                {
                    unit.Tower = PhOnboardingSupport.Trim(row.Tower);
                    unit.Floor = row.Floor;
                    unit.UnitType = PhOnboardingSupport.Trim(row.UnitType);
                    if (row.Coefficient.HasValue)
                    {
                        unit.CoefficientPercent = CoefficientValidator.Normalize(row.Coefficient.Value);
                    }

                    var active = ResolveUnitActive(row.Estado);
                    if (active.HasValue)
                    {
                        unit.IsActive = active.Value;
                    }

                    unitsUpdated++;
                }
            }

            foreach (var row in includedOwners.OrderBy(r => r.RowNumber))
            {
                if (string.IsNullOrWhiteSpace(row.Email))
                {
                    continue;
                }

                var email = row.Email.Trim().ToLowerInvariant();
                if (!ownerByEmail.TryGetValue(email, out var owner))
                {
                    if (row.Classification is "Existente" or "Actualizacion")
                    {
                        continue;
                    }

                    owner = new Owner
                    {
                        TenantId = tenantId,
                        DisplayName = PhOnboardingSupport.BuildDisplayName(
                            row.FirstName, row.LastName, row.DisplayName, email),
                        FirstName = PhOnboardingSupport.Trim(row.FirstName),
                        LastName = PhOnboardingSupport.Trim(row.LastName),
                        IdentificationType = PhOnboardingSupport.Trim(row.IdType),
                        Identification = PhOnboardingSupport.Trim(row.Identification),
                        Email = email,
                        Phone = PhOnboardingSupport.Trim(row.Phone),
                        Status = OwnerLifecycleStatus.Draft,
                        RegisteredPropertyHorizontalId = phId,
                        ConcurrencyStamp = Guid.NewGuid().ToString("N")
                    };
                    _db.Owners.Add(owner);
                    ownerByEmail[email] = owner;
                    if (!string.IsNullOrWhiteSpace(owner.Identification))
                    {
                        ownerByIdentification.TryAdd(owner.Identification, owner);
                    }

                    ownersCreated++;
                    createdOwnerIds.Add(owner.Id);
                }
                else if (mode == PhRosterImportModes.CreateAndUpdate
                         && row.Classification == "Actualizacion")
                {
                    owner.FirstName = PhOnboardingSupport.Trim(row.FirstName) ?? owner.FirstName;
                    owner.LastName = PhOnboardingSupport.Trim(row.LastName) ?? owner.LastName;
                    owner.DisplayName = PhOnboardingSupport.BuildDisplayName(
                        row.FirstName ?? owner.FirstName,
                        row.LastName ?? owner.LastName,
                        row.DisplayName ?? owner.DisplayName,
                        owner.Email);
                    if (!string.IsNullOrWhiteSpace(row.IdType))
                    {
                        owner.IdentificationType = PhOnboardingSupport.Trim(row.IdType);
                    }

                    if (!string.IsNullOrWhiteSpace(row.Identification))
                    {
                        owner.Identification = PhOnboardingSupport.Trim(row.Identification);
                    }

                    if (!string.IsNullOrWhiteSpace(row.Phone))
                    {
                        owner.Phone = PhOnboardingSupport.Trim(row.Phone);
                    }

                    owner.RegisteredPropertyHorizontalId ??= phId;
                    ownersUpdated++;
                }
                else
                {
                    owner.RegisteredPropertyHorizontalId ??= phId;
                }
            }

            // Refresh ownership query keys for newly added units (Ids assigned in-memory)
            foreach (var row in includedRelations.OrderBy(r => r.RowNumber))
            {
                if (row.Classification is "Existente" or "Error")
                {
                    continue;
                }

                var unitCode = row.UnitCode?.Trim();
                if (string.IsNullOrWhiteSpace(unitCode) || !unitByCode.TryGetValue(unitCode, out var unit))
                {
                    continue;
                }

                Owner? owner = null;
                if (!string.IsNullOrWhiteSpace(row.Email)
                    && ownerByEmail.TryGetValue(row.Email.Trim(), out var byEmail))
                {
                    owner = byEmail;
                }
                else if (!string.IsNullOrWhiteSpace(row.Identification)
                         && ownerByIdentification.TryGetValue(row.Identification.Trim(), out var byId))
                {
                    owner = byId;
                }

                if (owner is null)
                {
                    continue;
                }

                var key = (unit.Id, owner.Id);
                if (!ownershipKeys.Add(key))
                {
                    continue;
                }

                var share = CoefficientValidator.Normalize(row.SharePercent is > 0 and <= 100
                    ? row.SharePercent.Value
                    : 100m);
                var isActive = ResolveUnitActive(row.Estado) ?? true;
                var ownership = new Ownership
                {
                    TenantId = tenantId,
                    UnitId = unit.Id,
                    OwnerId = owner.Id,
                    SharePercent = share,
                    EffectiveFromUtc = DateTimeOffset.UtcNow,
                    IsActive = isActive
                };
                _db.Ownerships.Add(ownership);
                ownershipsCreated++;
                createdOwnershipIds.Add(ownership.Id);
            }

            // Validate share totals for units we touched
            var touchedUnitIds = includedRelations
                .Where(r => r.Included && r.Classification == "Nuevo" && !string.IsNullOrWhiteSpace(r.UnitCode))
                .Select(r => r.UnitCode!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Where(c => unitByCode.ContainsKey(c))
                .Select(c => unitByCode[c].Id)
                .ToHashSet();

            foreach (var unitId in touchedUnitIds)
            {
                await EnsureShareTotalNotOverflowAsync(unitId, cancellationToken);
            }

            await _db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }

        await _audit.WriteAsync(
            AuditEventType.PhRosterBulkImported,
            correlationId: phId,
            metadata: new
            {
                session.SessionId,
                session.SafeFileName,
                session.FileHash,
                Mode = mode,
                UnitsCreated = unitsCreated,
                UnitsUpdated = unitsUpdated,
                OwnersCreated = ownersCreated,
                OwnersUpdated = ownersUpdated,
                OwnershipsCreated = ownershipsCreated,
                UnitIds = createdUnitIds,
                OwnerIds = createdOwnerIds,
                OwnershipIds = createdOwnershipIds
            },
            cancellationToken: cancellationToken);

        var result = new PhRosterImportCommitResultDto(
            session.SessionId,
            unitsCreated,
            unitsUpdated,
            ownersCreated,
            ownersUpdated,
            ownershipsCreated);

        if (!string.IsNullOrWhiteSpace(request.ClientRequestId))
        {
            Idempotency[phId + ":" + request.ClientRequestId.Trim()] = result;
        }

        Sessions.TryRemove(session.SessionId, out _);
        return result;
    }

    public byte[] BuildErrorReport(Guid sessionId)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        if (!Sessions.TryGetValue(sessionId, out var session)
            || session.ExpiresAtUtc < DateTimeOffset.UtcNow)
        {
            throw new DomainException("IMPORT_SESSION_EXPIRED", "La vista previa expiró. Vuelva a cargar el archivo.");
        }

        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);

        var rows = new List<(int Row, string Field, string? Value, string Problem, string Action)>();
        foreach (var u in session.Units.Where(r => r.Status is "Error" or "Warning"))
        {
            foreach (var issue in u.Issues)
            {
                rows.Add((u.RowNumber, "Unidad", u.Code, issue, "Corrija o excluya la fila."));
            }
        }

        foreach (var o in session.Owners.Where(r => r.Status is "Error" or "Warning"))
        {
            foreach (var issue in o.Issues)
            {
                rows.Add((o.RowNumber, "Propietario", MaskEmail(o.Email), issue, "Corrija o excluya la fila."));
            }
        }

        foreach (var rel in session.Relations.Where(r => r.Status is "Error" or "Warning"))
        {
            foreach (var issue in rel.Issues)
            {
                rows.Add((rel.RowNumber, "Relacion", rel.UnitCode, issue, "Corrija o excluya la fila."));
            }
        }

        return _workbook.BuildErrorReport(rows);
    }

    private async Task<PhRosterImportPreviewDto> BuildPreviewFromSheetsAsync(
        PropertyHorizontal ph,
        IReadOnlyList<string> unitHeaders,
        IReadOnlyList<string[]> unitRows,
        IReadOnlyList<string> ownerHeaders,
        IReadOnlyList<string[]> ownerRows,
        IReadOnlyList<string> relationHeaders,
        IReadOnlyList<string[]> relationRows,
        string? fileName,
        string kind,
        CancellationToken ct)
    {
        var total = unitRows.Count + ownerRows.Count + relationRows.Count;
        if (total == 0)
        {
            throw new DomainException("IMPORT_FILE_EMPTY", "El archivo no tiene filas de datos.");
        }

        if (total > MaxRows)
        {
            throw new DomainException("IMPORT_TOO_MANY_ROWS", $"El archivo supera el máximo de {MaxRows} filas.");
        }

        var session = NewSession(ph, fileName, kind);
        session.FileHash = ComputeHash(
            unitHeaders.Concat(ownerHeaders).Concat(relationHeaders).ToList(),
            unitRows.Concat(ownerRows).Concat(relationRows).ToList());

        ParseUnitRows(session, unitHeaders, unitRows);
        ParseOwnerRows(session, ownerHeaders, ownerRows);
        ParseRelationRows(session, relationHeaders, relationRows);

        await ValidateSessionAsync(session, ct);
        Sessions[session.SessionId] = session;
        SweepExpired();
        return ToPreview(session);
    }

    private async Task<PhRosterImportPreviewDto> BuildPreviewFromLegacyFlatAsync(
        PropertyHorizontal ph,
        IReadOnlyList<string> headers,
        IReadOnlyList<string[]> rows,
        string? fileName,
        string kind,
        CancellationToken ct)
    {
        if (rows.Count == 0)
        {
            throw new DomainException("IMPORT_FILE_EMPTY", "El archivo no tiene filas de datos.");
        }

        if (rows.Count > MaxRows)
        {
            throw new DomainException("IMPORT_TOO_MANY_ROWS", $"El archivo supera el máximo de {MaxRows} filas.");
        }

        var session = NewSession(ph, fileName, kind);
        session.FileHash = ComputeHash(headers, rows);
        SynthesizeFromLegacyFlat(session, headers, rows);
        await ValidateSessionAsync(session, ct);
        Sessions[session.SessionId] = session;
        SweepExpired();
        return ToPreview(session);
    }

    private async Task<PhRosterImportPreviewDto> BuildPreviewFromCsvAsync(
        PropertyHorizontal ph,
        IReadOnlyList<string> headers,
        IReadOnlyList<string[]> rows,
        string? fileName,
        CancellationToken ct)
    {
        if (rows.Count == 0)
        {
            throw new DomainException("IMPORT_FILE_EMPTY", "El archivo no tiene filas de datos.");
        }

        if (rows.Count > MaxRows)
        {
            throw new DomainException("IMPORT_TOO_MANY_ROWS", $"El archivo supera el máximo de {MaxRows} filas.");
        }

        var session = NewSession(ph, fileName, "csv");
        session.FileHash = ComputeHash(headers, rows);
        var kind = DetectCsvKind(headers);

        switch (kind)
        {
            case CsvKind.Units:
                ParseUnitRows(session, headers, rows);
                break;
            case CsvKind.Owners:
                ParseOwnerRows(session, headers, rows);
                break;
            case CsvKind.Relations:
                ParseRelationRows(session, headers, rows);
                break;
            default:
                SynthesizeFromLegacyFlat(session, headers, rows);
                break;
        }

        await ValidateSessionAsync(session, ct);
        Sessions[session.SessionId] = session;
        SweepExpired();
        return ToPreview(session);
    }

    private ImportSession NewSession(PropertyHorizontal ph, string? fileName, string kind)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        return new ImportSession
        {
            SessionId = Guid.NewGuid(),
            PhId = ph.Id,
            PhName = ph.Name,
            TenantId = _currentTenant.TenantId,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            Mode = PhRosterImportModes.CreateOnly,
            SourceKind = kind,
            SafeFileName = SanitizeFileName(fileName)
        };
    }

    private async Task ValidateSessionAsync(ImportSession session, CancellationToken ct)
    {
        var phId = session.PhId;
        var tenantId = session.TenantId;
        var mode = session.Mode;

        var unitsDb = await _db.Units.AsNoTracking()
            .Where(u => u.PropertyHorizontalId == phId)
            .ToListAsync(ct);
        var unitByCode = unitsDb.ToDictionary(u => u.Code, StringComparer.OrdinalIgnoreCase);

        var ownersDb = await _db.Owners.AsNoTracking()
            .Where(o => o.TenantId == tenantId)
            .ToListAsync(ct);
        var ownerByEmail = ownersDb.ToDictionary(o => o.Email, StringComparer.OrdinalIgnoreCase);
        var ownerById = new Dictionary<string, Owner>(StringComparer.OrdinalIgnoreCase);
        foreach (var o in ownersDb)
        {
            if (!string.IsNullOrWhiteSpace(o.Identification))
            {
                ownerById.TryAdd(o.Identification.Trim(), o);
            }
        }

        var unitIds = unitsDb.Select(u => u.Id).ToList();
        var ownershipsDb = unitIds.Count == 0
            ? []
            : await _db.Ownerships.AsNoTracking()
                .Where(o => o.TenantId == tenantId && unitIds.Contains(o.UnitId) && o.IsActive)
                .ToListAsync(ct);

        var live = await _db.Assemblies.AsNoTracking()
            .Where(a => a.PropertyHorizontalId == phId && LiveAssemblyStatuses.Contains(a.Status))
            .Select(a => new { a.Title, a.Status })
            .FirstOrDefaultAsync(ct);

        session.ActiveAssemblyBlocked = live is not null;
        session.ActiveAssemblyMessage = live is null
            ? null
            : $"Hay una asamblea en estado «{StatusLabel(live.Status)}» («{live.Title}»). "
              + "No se pueden crear ni actualizar unidades, coeficientes ni titularidades mientras la asamblea esté en check-in o en curso. "
              + "Espere a que finalice o se cancele la asamblea e intente de nuevo.";

        var warnings = new List<string>();
        if (!string.IsNullOrWhiteSpace(session.ConfirmPhNameWarning))
        {
            warnings.Add(session.ConfirmPhNameWarning);
        }

        // --- Units ---
        var codeCounts = session.Units
            .Where(r => r.Included && !string.IsNullOrWhiteSpace(r.Code))
            .GroupBy(r => r.Code!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        foreach (var row in session.Units)
        {
            var errors = new List<string>();
            var warns = new List<string>();
            if (!row.Included)
            {
                row.Status = "Ok";
                row.Classification = "Existente";
                row.Issues = ["Excluida de la importación"];
                continue;
            }

            EnforceCellLength(row.Code, "CodigoUnidad", errors);
            EnforceCellLength(row.Tower, "TorreBloque", errors);
            EnforceCellLength(row.UnitType, "TipoUnidad", errors);

            if (string.IsNullOrWhiteSpace(row.Code))
            {
                errors.Add("El código de unidad es obligatorio.");
            }
            else if (codeCounts.TryGetValue(row.Code.Trim(), out var cc) && cc > 1)
            {
                errors.Add("Código de unidad duplicado en el archivo.");
            }

            if (row.FloorParseFailed)
            {
                errors.Add("El piso debe ser un número entero.");
            }

            if (row.CoefficientParseFailed)
            {
                errors.Add("El coeficiente debe ser un número decimal.");
            }
            else if (row.Coefficient is decimal c && (c < 0 || c > 100))
            {
                errors.Add("El coeficiente debe estar entre 0 y 100.");
            }

            var active = ResolveUnitActive(row.Estado);
            if (!string.IsNullOrWhiteSpace(row.Estado) && active is null)
            {
                errors.Add("Estado de unidad inválido. Use Activa o Inactiva.");
            }

            string classification;
            if (errors.Count > 0)
            {
                classification = "Error";
            }
            else if (!string.IsNullOrWhiteSpace(row.Code) && unitByCode.TryGetValue(row.Code.Trim(), out var existing))
            {
                var differs = !string.Equals(existing.Tower, row.Tower, StringComparison.OrdinalIgnoreCase)
                    || existing.Floor != row.Floor
                    || !string.Equals(existing.UnitType, row.UnitType, StringComparison.OrdinalIgnoreCase)
                    || (row.Coefficient.HasValue
                        && Math.Abs(existing.CoefficientPercent - CoefficientValidator.Normalize(row.Coefficient.Value))
                        > CoefficientValidator.Tolerance)
                    || (active.HasValue && existing.IsActive != active.Value);

                if (mode == PhRosterImportModes.CreateAndUpdate && differs)
                {
                    classification = "Actualizacion";
                    warns.Add("La unidad ya existe y se actualizará al confirmar CreateAndUpdate.");
                }
                else
                {
                    classification = "Existente";
                    warns.Add("La unidad ya existe; en CreateOnly se omitirá.");
                }
            }
            else
            {
                classification = "Nuevo";
            }

            row.Classification = classification;
            if (errors.Count > 0)
            {
                row.Status = "Error";
                row.Issues = errors.Concat(warns).ToList();
            }
            else if (warns.Count > 0)
            {
                row.Status = "Warning";
                row.Issues = warns;
            }
            else
            {
                row.Status = "Ok";
                row.Issues = ["Lista para importar"];
            }
        }

        // --- Owners ---
        var emailCounts = session.Owners
            .Where(r => r.Included && !string.IsNullOrWhiteSpace(r.Email))
            .GroupBy(r => r.Email!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        var idRows = new Dictionary<string, (string Email, int Row)>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in session.Owners)
        {
            var errors = new List<string>();
            var warns = new List<string>();
            if (!row.Included)
            {
                row.Status = "Ok";
                row.Classification = "Existente";
                row.Issues = ["Excluida de la importación"];
                continue;
            }

            EnforceCellLength(row.Email, "Correo", errors);
            EnforceCellLength(row.Identification, "NumeroIdentificacion", errors);
            EnforceCellLength(row.DisplayName, "NombreCompletoRazonSocial", errors);

            if (string.IsNullOrWhiteSpace(row.Email))
            {
                errors.Add("El correo es obligatorio.");
            }
            else if (!PhOnboardingSupport.IsValidEmail(row.Email))
            {
                errors.Add("El correo no tiene un formato válido.");
            }
            else if (emailCounts.TryGetValue(row.Email.Trim(), out var ec) && ec > 1)
            {
                errors.Add("Correo duplicado en el archivo.");
            }

            if (!string.IsNullOrWhiteSpace(row.Identification))
            {
                var idKey = row.Identification.Trim();
                if (idRows.TryGetValue(idKey, out var prior)
                    && !string.Equals(prior.Email, row.Email, StringComparison.OrdinalIgnoreCase))
                {
                    errors.Add($"La identificación '{idKey}' ya aparece en la fila {prior.Row} con otro correo.");
                }
                else
                {
                    idRows[idKey] = (row.Email ?? string.Empty, row.RowNumber);
                }

                if (ownerById.TryGetValue(idKey, out var byId)
                    && !string.IsNullOrWhiteSpace(row.Email)
                    && !string.Equals(byId.Email, row.Email, StringComparison.OrdinalIgnoreCase))
                {
                    errors.Add(
                        $"Conflicto: la identificación '{idKey}' pertenece a otro correo en el sistema ({MaskEmail(byId.Email)}).");
                    row.Classification = "Conflicto";
                }
            }

            var ownerStatus = ResolveOwnerStatus(row.Estado);
            if (!string.IsNullOrWhiteSpace(row.Estado) && ownerStatus is null)
            {
                errors.Add("Estado de propietario inválido. Use Borrador, Activo o Inactivo.");
            }

            string classification;
            if (errors.Count > 0 && row.Classification == "Conflicto")
            {
                classification = "Conflicto";
            }
            else if (errors.Count > 0)
            {
                classification = "Error";
            }
            else if (!string.IsNullOrWhiteSpace(row.Email)
                     && ownerByEmail.TryGetValue(row.Email.Trim(), out var existing))
            {
                var differs = !string.Equals(existing.FirstName, row.FirstName, StringComparison.OrdinalIgnoreCase)
                    || !string.Equals(existing.LastName, row.LastName, StringComparison.OrdinalIgnoreCase)
                    || (!string.IsNullOrWhiteSpace(row.DisplayName)
                        && !string.Equals(existing.DisplayName, row.DisplayName, StringComparison.OrdinalIgnoreCase))
                    || (!string.IsNullOrWhiteSpace(row.Phone)
                        && !string.Equals(existing.Phone, row.Phone, StringComparison.OrdinalIgnoreCase))
                    || (!string.IsNullOrWhiteSpace(row.Identification)
                        && !string.Equals(existing.Identification, row.Identification, StringComparison.OrdinalIgnoreCase))
                    || (!string.IsNullOrWhiteSpace(row.IdType)
                        && !string.Equals(existing.IdentificationType, row.IdType, StringComparison.OrdinalIgnoreCase));

                if (mode == PhRosterImportModes.CreateAndUpdate && differs)
                {
                    classification = "Actualizacion";
                    warns.Add("El propietario ya existe y se actualizará al confirmar CreateAndUpdate.");
                }
                else
                {
                    classification = "Existente";
                    warns.Add("El propietario ya existe; en CreateOnly se omitirá.");
                }
            }
            else
            {
                classification = "Nuevo";
            }

            row.Classification = classification;
            if (errors.Count > 0)
            {
                row.Status = "Error";
                row.Issues = errors.Concat(warns).ToList();
            }
            else if (warns.Count > 0)
            {
                row.Status = "Warning";
                row.Issues = warns;
            }
            else
            {
                row.Status = "Ok";
                row.Issues = ["Lista para importar"];
            }
        }

        // --- Relations ---
        var fileUnitsByCode = session.Units
            .Where(u => u.Included && !string.IsNullOrWhiteSpace(u.Code) && u.Status != "Error")
            .GroupBy(u => u.Code!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var fileOwnersByEmail = session.Owners
            .Where(o => o.Included && !string.IsNullOrWhiteSpace(o.Email) && o.Status != "Error")
            .GroupBy(o => o.Email!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var fileOwnersById = session.Owners
            .Where(o => o.Included && !string.IsNullOrWhiteSpace(o.Identification) && o.Status != "Error")
            .GroupBy(o => o.Identification!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var fileShareByUnit = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        var relationKeys = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in session.Relations)
        {
            var errors = new List<string>();
            var warns = new List<string>();
            if (!row.Included)
            {
                row.Status = "Ok";
                row.Classification = "Existente";
                row.Issues = ["Excluida de la importación"];
                continue;
            }

            if (string.IsNullOrWhiteSpace(row.Email) && string.IsNullOrWhiteSpace(row.Identification))
            {
                errors.Add("Indique correo o número de identificación del propietario.");
            }

            if (string.IsNullOrWhiteSpace(row.UnitCode))
            {
                errors.Add("El código de unidad es obligatorio.");
            }

            if (row.ShareParseFailed)
            {
                errors.Add("PorcentajePropiedad debe ser un número decimal.");
            }
            else
            {
                row.SharePercent ??= 100m;
                if (row.SharePercent is <= 0 or > 100)
                {
                    errors.Add("PorcentajePropiedad debe ser mayor que 0 y como máximo 100.");
                }
            }

            var relActive = ResolveUnitActive(row.Estado);
            if (!string.IsNullOrWhiteSpace(row.Estado) && relActive is null)
            {
                errors.Add("Estado de relación inválido. Use Activa o Inactiva.");
            }

            Owner? dbOwner = null;
            if (!string.IsNullOrWhiteSpace(row.Email)
                && ownerByEmail.TryGetValue(row.Email.Trim(), out var oe))
            {
                dbOwner = oe;
            }

            if (dbOwner is null && !string.IsNullOrWhiteSpace(row.Identification))
            {
                ownerById.TryGetValue(row.Identification.Trim(), out dbOwner);
            }

            var ownerInFile = (!string.IsNullOrWhiteSpace(row.Email)
                               && fileOwnersByEmail.ContainsKey(row.Email.Trim()))
                              || (!string.IsNullOrWhiteSpace(row.Identification)
                                  && fileOwnersById.ContainsKey(row.Identification.Trim()));

            if (dbOwner is null && !ownerInFile && errors.Count == 0)
            {
                errors.Add("No se encontró el propietario por correo ni identificación (archivo o sistema).");
            }

            Unit? dbUnit = null;
            var unitInFile = !string.IsNullOrWhiteSpace(row.UnitCode)
                             && fileUnitsByCode.ContainsKey(row.UnitCode.Trim());
            if (!string.IsNullOrWhiteSpace(row.UnitCode))
            {
                unitByCode.TryGetValue(row.UnitCode.Trim(), out dbUnit);
            }

            if (dbUnit is null && !unitInFile && errors.Count == 0)
            {
                errors.Add($"La unidad '{row.UnitCode}' no existe en el archivo ni en el sistema.");
            }

            // Resolve owner/unit ids for duplicate relation check
            Guid? ownerId = dbOwner?.Id;
            Guid? unitId = dbUnit?.Id;
            string? ownerKey = !string.IsNullOrWhiteSpace(row.Email)
                ? "e:" + row.Email.Trim().ToLowerInvariant()
                : !string.IsNullOrWhiteSpace(row.Identification)
                    ? "i:" + row.Identification.Trim()
                    : null;

            if (!string.IsNullOrWhiteSpace(row.UnitCode) && ownerKey is not null)
            {
                var rk = row.UnitCode.Trim() + "|" + ownerKey;
                if (relationKeys.TryGetValue(rk, out var priorRow))
                {
                    errors.Add($"Relación duplicada en el archivo (también en fila {priorRow}).");
                }
                else
                {
                    relationKeys[rk] = row.RowNumber;
                }
            }

            if (unitId.HasValue && ownerId.HasValue
                && ownershipsDb.Any(o => o.UnitId == unitId && o.OwnerId == ownerId))
            {
                row.Classification = "Existente";
                warns.Add("La titularidad ya existe; no se modificará el porcentaje.");
            }

            if (!string.IsNullOrWhiteSpace(row.UnitCode) && row.SharePercent is decimal sp && sp > 0)
            {
                var code = row.UnitCode.Trim();
                fileShareByUnit.TryGetValue(code, out var prior);
                fileShareByUnit[code] = CoefficientValidator.Normalize(prior + sp);
            }

            string classification;
            if (errors.Count > 0)
            {
                classification = "Error";
            }
            else if (row.Classification == "Existente")
            {
                classification = "Existente";
            }
            else
            {
                classification = "Nuevo";
            }

            row.Classification = classification;
            if (errors.Count > 0)
            {
                row.Status = "Error";
                row.Issues = errors.Concat(warns).ToList();
            }
            else if (warns.Count > 0)
            {
                row.Status = "Warning";
                row.Issues = warns;
            }
            else
            {
                row.Status = "Ok";
                row.Issues = ["Lista para importar"];
            }
        }

        // Share sum checks per unit
        foreach (var (code, fileShare) in fileShareByUnit)
        {
            decimal dbShare = 0;
            if (unitByCode.TryGetValue(code, out var u))
            {
                dbShare = CoefficientValidator.Normalize(
                    ownershipsDb.Where(o => o.UnitId == u.Id).Sum(o => o.SharePercent));
            }

            // Exclude DB share for relations that already exist and are classified Existente
            // (file share for existing relations still counted once — we don't re-add)
            var newFileShare = CoefficientValidator.Normalize(
                session.Relations
                    .Where(r => r.Included
                                && r.Classification == "Nuevo"
                                && string.Equals(r.UnitCode, code, StringComparison.OrdinalIgnoreCase)
                                && r.SharePercent.HasValue)
                    .Sum(r => r.SharePercent!.Value));

            var projected = CoefficientValidator.Normalize(dbShare + newFileShare);
            if (projected > 100.0001m)
            {
                foreach (var r in session.Relations.Where(r =>
                             r.Included
                             && r.Classification == "Nuevo"
                             && string.Equals(r.UnitCode, code, StringComparison.OrdinalIgnoreCase)))
                {
                    r.Status = "Error";
                    r.Classification = "Error";
                    r.Issues = r.Issues.Append(
                        $"La suma de porcentajes de propiedad para la unidad '{code}' sería {projected:0.####}% (máximo 100%).").ToList();
                }
            }
        }

        // Coefficient projection
        var coefficientCurrent = CoefficientValidator.Normalize(
            unitsDb.Where(u => u.IsActive).Sum(u => u.CoefficientPercent));

        var projectedMap = unitsDb
            .Where(u => u.IsActive)
            .ToDictionary(u => u.Code, u => u.CoefficientPercent, StringComparer.OrdinalIgnoreCase);

        decimal fileNew = 0;
        foreach (var row in session.Units.Where(r => r.Included && r.Status != "Error"))
        {
            if (string.IsNullOrWhiteSpace(row.Code) || !row.Coefficient.HasValue)
            {
                continue;
            }

            var code = row.Code.Trim();
            var coeff = CoefficientValidator.Normalize(row.Coefficient.Value);
            var isActive = ResolveUnitActive(row.Estado) ?? true;

            if (row.Classification == "Nuevo")
            {
                if (isActive)
                {
                    fileNew = CoefficientValidator.Normalize(fileNew + coeff);
                    projectedMap[code] = coeff;
                }
            }
            else if (row.Classification == "Actualizacion" && mode == PhRosterImportModes.CreateAndUpdate)
            {
                if (isActive)
                {
                    projectedMap[code] = coeff;
                }
                else
                {
                    projectedMap.Remove(code);
                }
            }
        }

        var coefficientProjected = CoefficientValidator.Normalize(projectedMap.Values.Sum());
        var coefficientDelta = CoefficientValidator.Normalize(CoefficientValidator.ExpectedTotal - coefficientProjected);
        if (!CoefficientValidator.IsComplete(coefficientProjected))
        {
            warnings.Add(
                $"El total proyectado de coeficientes es {coefficientProjected:0.####}% (esperado 100 ± {CoefficientValidator.Tolerance}). "
                + "Esto no bloquea la importación, pero el PH puede quedar incompleto para asamblea.");
        }

        session.CoefficientCurrent = coefficientCurrent;
        session.CoefficientFileNew = fileNew;
        session.CoefficientProjected = coefficientProjected;
        session.CoefficientDelta = coefficientDelta;
        session.Warnings = warnings;

        static int CountClass(IEnumerable<RowBase> rows, string c) =>
            rows.Count(r => r.Included && r.Classification == c);

        static int CountErrors(IEnumerable<RowBase> rows) =>
            rows.Count(r => r.Included && r.Status == "Error");

        session.SummaryUnitsNew = CountClass(session.Units, "Nuevo");
        session.SummaryUnitsExisting = CountClass(session.Units, "Existente");
        session.SummaryUnitsUpdates = CountClass(session.Units, "Actualizacion");
        session.SummaryUnitsErrors = CountErrors(session.Units);
        session.SummaryOwnersNew = CountClass(session.Owners, "Nuevo");
        session.SummaryOwnersExisting = CountClass(session.Owners, "Existente");
        session.SummaryOwnersUpdates = CountClass(session.Owners, "Actualizacion");
        session.SummaryOwnersErrors = CountErrors(session.Owners);
        session.SummaryRelationsNew = CountClass(session.Relations, "Nuevo");
        session.SummaryRelationsExisting = CountClass(session.Relations, "Existente");
        session.SummaryRelationsUpdates = CountClass(session.Relations, "Actualizacion");
        session.SummaryRelationsErrors = CountErrors(session.Relations);

        var hasIncluded = session.Units.Any(r => r.Included)
            || session.Owners.Any(r => r.Included)
            || session.Relations.Any(r => r.Included);
        var hasErrors = session.SummaryUnitsErrors + session.SummaryOwnersErrors + session.SummaryRelationsErrors > 0;
        var hasWork = session.SummaryUnitsNew + session.SummaryOwnersNew + session.SummaryRelationsNew
            + (mode == PhRosterImportModes.CreateAndUpdate
                ? session.SummaryUnitsUpdates + session.SummaryOwnersUpdates
                : 0) > 0;

        session.CanCommit = hasIncluded && !hasErrors && !session.ActiveAssemblyBlocked && hasWork;
    }

    private async Task EnsureShareTotalNotOverflowAsync(Guid unitId, CancellationToken ct)
    {
        await _db.Ownerships.Where(o => o.UnitId == unitId).LoadAsync(ct);
        var total = CoefficientValidator.Normalize(
            _db.Ownerships.Local.Where(o => o.UnitId == unitId && o.IsActive).Sum(o => o.SharePercent));
        if (total > 100.0001m)
        {
            throw new DomainException(
                "OWNERSHIP_SHARE_OVERFLOW",
                $"La titularidad de la unidad sumaría {total:0.####}% (máximo 100%).");
        }
    }

    private PhRosterImportPreviewDto ToPreview(ImportSession session) =>
        new(
            session.SessionId,
            session.PhId,
            session.PhName,
            session.Mode,
            session.Units.Select(u => new PhRosterUnitRowDto(
                u.RowNumber, u.Code, u.Tower, u.Floor, u.UnitType, u.Coefficient, u.Estado,
                u.Classification, u.Status, u.Issues, u.Included)).ToList(),
            session.Owners.Select(o => new PhRosterOwnerRowDto(
                o.RowNumber, o.IdType, o.Identification, o.FirstName, o.LastName, o.DisplayName,
                o.Email, o.Phone, o.Estado, o.Classification, o.Status, o.Issues, o.Included)).ToList(),
            session.Relations.Select(r => new PhRosterRelationRowDto(
                r.RowNumber, r.Identification, r.Email, r.UnitCode, r.SharePercent, r.Estado,
                r.Classification, r.Status, r.Issues, r.Included)).ToList(),
            new PhRosterImportSummaryDto(
                session.SummaryUnitsNew,
                session.SummaryUnitsExisting,
                session.SummaryUnitsUpdates,
                session.SummaryUnitsErrors,
                session.SummaryOwnersNew,
                session.SummaryOwnersExisting,
                session.SummaryOwnersUpdates,
                session.SummaryOwnersErrors,
                session.SummaryRelationsNew,
                session.SummaryRelationsExisting,
                session.SummaryRelationsUpdates,
                session.SummaryRelationsErrors,
                session.CoefficientCurrent,
                session.CoefficientFileNew,
                session.CoefficientProjected,
                session.CoefficientDelta,
                CoefficientValidator.ExpectedTotal,
                session.CanCommit,
                session.ActiveAssemblyBlocked,
                session.ActiveAssemblyMessage,
                session.Warnings),
            MaxRows,
            MaxFileBytes);

    private ImportSession GetSession(Guid sessionId, Guid phId)
    {
        if (!Sessions.TryGetValue(sessionId, out var session) || session.ExpiresAtUtc < DateTimeOffset.UtcNow)
        {
            throw new DomainException("IMPORT_SESSION_EXPIRED", "La vista previa expiró. Vuelva a cargar el archivo.");
        }

        if (session.PhId != phId)
        {
            throw new DomainException("IMPORT_SESSION_MISMATCH", "La vista previa no pertenece a esta propiedad horizontal.");
        }

        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);
        return session;
    }

    private async Task<PropertyHorizontal> LoadPhAsync(Guid phId, CancellationToken ct)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var ph = await _db.PropertyHorizontals.AsNoTracking()
                     .FirstOrDefaultAsync(p => p.Id == phId, ct)
                 ?? throw new DomainException("PH_NOT_FOUND", "Propiedad horizontal no encontrada.");
        TenantGuard.EnsureTenantMatch(_currentTenant, ph.TenantId);
        return ph;
    }

    private static void ParseUnitRows(ImportSession session, IReadOnlyList<string> headers, IReadOnlyList<string[]> rows)
    {
        var map = BuildHeaderMap(headers);
        var rowNum = 1;
        foreach (var raw in rows)
        {
            rowNum++;
            var code = Get(map, raw, "CodigoUnidad", "Unidad", "UnitCode", "Codigo");
            var tower = Get(map, raw, "TorreBloque", "Torre", "Tower", "Bloque");
            var floorRaw = Get(map, raw, "Piso", "Floor");
            int? floor = null;
            var floorFailed = false;
            if (!string.IsNullOrWhiteSpace(floorRaw))
            {
                if (int.TryParse(floorRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var f))
                {
                    floor = f;
                }
                else
                {
                    floorFailed = true;
                }
            }

            var coeffRaw = Get(map, raw, "Coeficiente", "CoefficientPercent", "Coefficient");
            decimal? coeff = null;
            var coeffFailed = false;
            if (!string.IsNullOrWhiteSpace(coeffRaw))
            {
                if (TryParseDecimal(coeffRaw, out var c))
                {
                    coeff = c;
                }
                else
                {
                    coeffFailed = true;
                }
            }

            session.Units.Add(new UnitRow
            {
                RowNumber = rowNum,
                Included = true,
                Code = code,
                Tower = tower,
                Floor = floor,
                FloorParseFailed = floorFailed,
                UnitType = Get(map, raw, "TipoUnidad", "UnitType"),
                Coefficient = coeff,
                CoefficientParseFailed = coeffFailed,
                Estado = Get(map, raw, "Estado", "EstadoUnidad") ?? "Activa"
            });
        }
    }

    private static void ParseOwnerRows(ImportSession session, IReadOnlyList<string> headers, IReadOnlyList<string[]> rows)
    {
        var map = BuildHeaderMap(headers);
        var rowNum = 1;
        foreach (var raw in rows)
        {
            rowNum++;
            var email = Get(map, raw, "Correo", "Email", "CorreoElectronico");
            session.Owners.Add(new OwnerRow
            {
                RowNumber = rowNum,
                Included = true,
                IdType = Get(map, raw, "TipoIdentificacion", "IdentificationType"),
                Identification = Get(map, raw, "NumeroIdentificacion", "Identificacion", "Identification"),
                FirstName = Get(map, raw, "Nombres", "Nombre", "FirstName"),
                LastName = Get(map, raw, "Apellidos", "Apellido", "LastName"),
                DisplayName = Get(map, raw, "NombreCompletoRazonSocial", "NombreCompleto", "DisplayName", "RazonSocial"),
                Email = string.IsNullOrWhiteSpace(email) ? null : email.ToLowerInvariant(),
                Phone = Get(map, raw, "Telefono", "Phone", "Celular"),
                Estado = Get(map, raw, "Estado", "EstadoPropietario") ?? "Borrador"
            });
        }
    }

    private static void ParseRelationRows(ImportSession session, IReadOnlyList<string> headers, IReadOnlyList<string[]> rows)
    {
        var map = BuildHeaderMap(headers);
        var rowNum = 1;
        foreach (var raw in rows)
        {
            rowNum++;
            var email = Get(map, raw, "Correo", "Email");
            var shareRaw = Get(map, raw, "PorcentajePropiedad", "SharePercent", "Porcentaje");
            decimal? share = null;
            var shareFailed = false;
            if (!string.IsNullOrWhiteSpace(shareRaw))
            {
                if (TryParseDecimal(shareRaw, out var s))
                {
                    share = s;
                }
                else
                {
                    shareFailed = true;
                }
            }

            session.Relations.Add(new RelationRow
            {
                RowNumber = rowNum,
                Included = true,
                Identification = Get(map, raw, "NumeroIdentificacion", "Identificacion", "Identification"),
                Email = string.IsNullOrWhiteSpace(email) ? null : email.ToLowerInvariant(),
                UnitCode = Get(map, raw, "CodigoUnidad", "Unidad", "UnitCode"),
                SharePercent = share,
                ShareParseFailed = shareFailed,
                Estado = Get(map, raw, "Estado", "EstadoRelacion") ?? "Activa"
            });
        }
    }

    private static void SynthesizeFromLegacyFlat(
        ImportSession session,
        IReadOnlyList<string> headers,
        IReadOnlyList<string[]> rows)
    {
        var map = BuildHeaderMap(headers);
        var rowNum = 1;
        foreach (var raw in rows)
        {
            rowNum++;
            var code = Get(map, raw, "Unidad", "CodigoUnidad", "UnitCode", "Codigo");
            var email = Get(map, raw, "Email", "Correo");
            var floorRaw = Get(map, raw, "Piso", "Floor");
            int? floor = null;
            var floorFailed = false;
            if (!string.IsNullOrWhiteSpace(floorRaw))
            {
                if (int.TryParse(floorRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var f))
                {
                    floor = f;
                }
                else
                {
                    floorFailed = true;
                }
            }

            var coeffRaw = Get(map, raw, "Coeficiente", "CoefficientPercent");
            decimal? coeff = null;
            var coeffFailed = false;
            if (!string.IsNullOrWhiteSpace(coeffRaw))
            {
                if (TryParseDecimal(coeffRaw, out var c))
                {
                    coeff = c;
                }
                else
                {
                    coeffFailed = true;
                }
            }

            session.Units.Add(new UnitRow
            {
                RowNumber = rowNum,
                Included = true,
                Code = code,
                Tower = Get(map, raw, "Torre", "TorreBloque"),
                Floor = floor,
                FloorParseFailed = floorFailed,
                Coefficient = coeff,
                CoefficientParseFailed = coeffFailed,
                Estado = "Activa"
            });

            session.Owners.Add(new OwnerRow
            {
                RowNumber = rowNum,
                Included = true,
                FirstName = Get(map, raw, "Nombre", "Nombres", "FirstName"),
                LastName = Get(map, raw, "Apellido", "Apellidos", "LastName"),
                Identification = Get(map, raw, "Identificacion", "NumeroIdentificacion"),
                Email = string.IsNullOrWhiteSpace(email) ? null : email.ToLowerInvariant(),
                Phone = Get(map, raw, "Telefono", "Phone"),
                Estado = "Borrador"
            });

            session.Relations.Add(new RelationRow
            {
                RowNumber = rowNum,
                Included = true,
                Identification = Get(map, raw, "Identificacion", "NumeroIdentificacion"),
                Email = string.IsNullOrWhiteSpace(email) ? null : email.ToLowerInvariant(),
                UnitCode = code,
                SharePercent = 100m,
                Estado = "Activa"
            });
        }
    }

    private static CsvKind DetectCsvKind(IReadOnlyList<string> headers)
    {
        var set = headers.Select(NormalizeHeader).ToHashSet(StringComparer.OrdinalIgnoreCase);
        bool Has(params string[] names) => names.Any(n => set.Contains(NormalizeHeader(n)));

        if (Has("CodigoUnidad", "Unidad") && Has("Coeficiente") && !Has("Correo", "Email"))
        {
            return CsvKind.Units;
        }

        if (Has("Correo", "Email") && Has("Nombres", "Nombre", "NombreCompleto", "NombreCompletoRazonSocial")
            && !Has("CodigoUnidad", "Unidad", "PorcentajePropiedad"))
        {
            return CsvKind.Owners;
        }

        if (Has("CodigoUnidad", "Unidad")
            && Has("Correo", "Email", "NumeroIdentificacion", "Identificacion")
            && Has("PorcentajePropiedad", "SharePercent"))
        {
            return CsvKind.Relations;
        }

        return CsvKind.LegacyFlat;
    }

    private static string NormalizeMode(string? mode) =>
        string.Equals(mode, PhRosterImportModes.CreateAndUpdate, StringComparison.OrdinalIgnoreCase)
            ? PhRosterImportModes.CreateAndUpdate
            : PhRosterImportModes.CreateOnly;

    private static string NormalizeSheet(string? sheet)
    {
        if (string.IsNullOrWhiteSpace(sheet))
        {
            return PhRosterImportSheets.Units;
        }

        var s = sheet.Trim();
        if (s.Equals("Units", StringComparison.OrdinalIgnoreCase)
            || s.Equals("Unidades", StringComparison.OrdinalIgnoreCase))
        {
            return PhRosterImportSheets.Units;
        }

        if (s.Equals("Owners", StringComparison.OrdinalIgnoreCase)
            || s.Equals("Propietarios", StringComparison.OrdinalIgnoreCase))
        {
            return PhRosterImportSheets.Owners;
        }

        if (s.Equals("Relations", StringComparison.OrdinalIgnoreCase)
            || s.Equals("PropietarioUnidad", StringComparison.OrdinalIgnoreCase)
            || s.Equals("Relaciones", StringComparison.OrdinalIgnoreCase))
        {
            return PhRosterImportSheets.Relations;
        }

        return s;
    }

    private static bool? ResolveUnitActive(string? estado)
    {
        if (string.IsNullOrWhiteSpace(estado))
        {
            return true;
        }

        var v = NormalizeHeader(estado);
        if (v is "activa" or "activo" or "active" or "si" or "true" or "1")
        {
            return true;
        }

        if (v is "inactiva" or "inactivo" or "inactive" or "no" or "false" or "0")
        {
            return false;
        }

        return null;
    }

    private static OwnerLifecycleStatus? ResolveOwnerStatus(string? estado)
    {
        if (string.IsNullOrWhiteSpace(estado))
        {
            return OwnerLifecycleStatus.Draft;
        }

        var v = NormalizeHeader(estado);
        return v switch
        {
            "borrador" or "draft" => OwnerLifecycleStatus.Draft,
            "activo" or "active" => OwnerLifecycleStatus.Active,
            "invitado" or "invited" => OwnerLifecycleStatus.Invited,
            "inactivo" or "inactive" => OwnerLifecycleStatus.Inactive,
            _ => null
        };
    }

    private static string StatusLabel(AssemblyStatus status) => status switch
    {
        AssemblyStatus.CheckIn => "Check-in",
        AssemblyStatus.InProgress => "En curso",
        AssemblyStatus.Paused => "Pausada",
        _ => status.ToString()
    };

    private static void EnforceCellLength(string? value, string field, List<string> errors)
    {
        if (value is { Length: > MaxCellLength })
        {
            errors.Add($"El campo {field} supera el máximo de {MaxCellLength} caracteres.");
        }
    }

    private static void EnsureStreamSize(Stream stream)
    {
        if (stream.CanSeek && stream.Length > MaxFileBytes)
        {
            throw new DomainException("IMPORT_FILE_TOO_LARGE", "El archivo supera el tamaño máximo permitido (5 MB).");
        }
    }

    private static bool LooksLikeXlsx(string? fileName, Stream stream)
    {
        if (!string.IsNullOrWhiteSpace(fileName)
            && fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return false;
    }

    private static Dictionary<string, int> BuildHeaderMap(IReadOnlyList<string> headers)
    {
        var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < headers.Count; i++)
        {
            var key = NormalizeHeader(headers[i]);
            if (!string.IsNullOrWhiteSpace(key) && !map.ContainsKey(key))
            {
                map[key] = i;
            }
        }

        return map;
    }

    private static string? Get(Dictionary<string, int> map, string[] raw, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (map.TryGetValue(NormalizeHeader(key), out var idx) && idx < raw.Length)
            {
                var v = TrimCell(raw[idx]);
                if (!string.IsNullOrWhiteSpace(v))
                {
                    return v;
                }
            }
        }

        return null;
    }

    private static string? TrimCell(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var v = value.Trim();
        if (v.StartsWith('\'') && v.Length > 1 && v[1] is '=' or '+' or '-' or '@')
        {
            v = v[1..];
        }

        return string.IsNullOrWhiteSpace(v) ? null : v;
    }

    private static string NormalizeHeader(string? h) =>
        (h ?? "").Trim()
            .Replace("ó", "o").Replace("Ó", "O")
            .Replace("í", "i").Replace("Í", "I")
            .Replace("ú", "u").Replace("Ú", "U")
            .Replace("á", "a").Replace("Á", "A")
            .Replace("é", "e").Replace("É", "E")
            .Replace("ñ", "n").Replace("Ñ", "N")
            .Replace(" ", "")
            .ToLowerInvariant();

    private static bool TryParseDecimal(string raw, out decimal value)
    {
        var normalized = raw.Replace("%", string.Empty).Trim();
        if (decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out value))
        {
            return true;
        }

        if (decimal.TryParse(normalized.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out value))
        {
            return true;
        }

        return decimal.TryParse(normalized, NumberStyles.Number, new CultureInfo("es-PA"), out value);
    }

    private static string SanitizeFileName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "import.xlsx";
        }

        var leaf = Path.GetFileName(name);
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            leaf = leaf.Replace(c, '_');
        }

        return leaf.Length > 120 ? leaf[..120] : leaf;
    }

    private static string ComputeHash(IReadOnlyList<string> headers, IReadOnlyList<string[]> rows)
    {
        using var sha = SHA256.Create();
        var sb = new StringBuilder();
        sb.AppendJoin('|', headers);
        foreach (var r in rows)
        {
            sb.Append('\n');
            sb.AppendJoin('|', r);
        }

        var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexString(bytes);
    }

    private static void SweepExpired()
    {
        foreach (var kv in Sessions)
        {
            if (kv.Value.ExpiresAtUtc < DateTimeOffset.UtcNow)
            {
                Sessions.TryRemove(kv.Key, out _);
            }
        }
    }

    private static string MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
        {
            return string.Empty;
        }

        var at = email.IndexOf('@');
        if (at <= 1)
        {
            return "***";
        }

        return email[0] + "***" + email[at..];
    }

    internal static IReadOnlyList<string[]> ParseCsv(string content)
    {
        var rows = new List<string[]>();
        using var reader = new StringReader(content);
        string? line;
        char? delimiter = null;
        while ((line = reader.ReadLine()) is not null)
        {
            if (delimiter is null)
            {
                var commas = line.Count(c => c == ',');
                var semis = line.Count(c => c == ';');
                delimiter = semis > commas ? ';' : ',';
            }

            rows.Add(SplitCsvLine(line, delimiter.Value));
        }

        return rows.Where(r => r.Length > 1 || !string.IsNullOrWhiteSpace(r[0])).ToList();
    }

    private static string[] SplitCsvLine(string line, char delimiter)
    {
        var fields = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"')
                    {
                        field.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    field.Append(c);
                }
            }
            else if (c == '"')
            {
                inQuotes = true;
            }
            else if (c == delimiter)
            {
                fields.Add(field.ToString());
                field.Clear();
            }
            else
            {
                field.Append(c);
            }
        }

        fields.Add(field.ToString());
        return fields.ToArray();
    }

    private enum CsvKind
    {
        Units,
        Owners,
        Relations,
        LegacyFlat
    }

    private sealed class ImportSession
    {
        public required Guid SessionId { get; init; }
        public required Guid PhId { get; init; }
        public required string PhName { get; init; }
        public required Guid TenantId { get; init; }
        public required DateTimeOffset CreatedAtUtc { get; init; }
        public DateTimeOffset ExpiresAtUtc => CreatedAtUtc + SessionLifetime;
        public string Mode { get; set; } = PhRosterImportModes.CreateOnly;
        public string SourceKind { get; init; } = "xlsx";
        public string SafeFileName { get; init; } = "import.xlsx";
        public string FileHash { get; set; } = string.Empty;
        public List<UnitRow> Units { get; } = [];
        public List<OwnerRow> Owners { get; } = [];
        public List<RelationRow> Relations { get; } = [];
        public bool ActiveAssemblyBlocked { get; set; }
        public string? ActiveAssemblyMessage { get; set; }
        public string? ConfirmPhNameWarning { get; set; }
        public IReadOnlyList<string> Warnings { get; set; } = [];
        public decimal CoefficientCurrent { get; set; }
        public decimal CoefficientFileNew { get; set; }
        public decimal CoefficientProjected { get; set; }
        public decimal CoefficientDelta { get; set; }
        public bool CanCommit { get; set; }
        public int SummaryUnitsNew { get; set; }
        public int SummaryUnitsExisting { get; set; }
        public int SummaryUnitsUpdates { get; set; }
        public int SummaryUnitsErrors { get; set; }
        public int SummaryOwnersNew { get; set; }
        public int SummaryOwnersExisting { get; set; }
        public int SummaryOwnersUpdates { get; set; }
        public int SummaryOwnersErrors { get; set; }
        public int SummaryRelationsNew { get; set; }
        public int SummaryRelationsExisting { get; set; }
        public int SummaryRelationsUpdates { get; set; }
        public int SummaryRelationsErrors { get; set; }
    }

    private abstract class RowBase
    {
        public int RowNumber { get; set; }
        public bool Included { get; set; } = true;
        public string Classification { get; set; } = "Nuevo";
        public string Status { get; set; } = "Ok";
        public IReadOnlyList<string> Issues { get; set; } = [];
    }

    private sealed class UnitRow : RowBase
    {
        public string? Code { get; set; }
        public string? Tower { get; set; }
        public int? Floor { get; set; }
        public bool FloorParseFailed { get; set; }
        public string? UnitType { get; set; }
        public decimal? Coefficient { get; set; }
        public bool CoefficientParseFailed { get; set; }
        public string? Estado { get; set; }
    }

    private sealed class OwnerRow : RowBase
    {
        public string? IdType { get; set; }
        public string? Identification { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? DisplayName { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Estado { get; set; }
    }

    private sealed class RelationRow : RowBase
    {
        public string? Identification { get; set; }
        public string? Email { get; set; }
        public string? UnitCode { get; set; }
        public decimal? SharePercent { get; set; }
        public bool ShareParseFailed { get; set; }
        public string? Estado { get; set; }
    }
}
