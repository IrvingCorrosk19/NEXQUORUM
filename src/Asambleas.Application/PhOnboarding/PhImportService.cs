namespace Asambleas.Application.PhOnboarding;

using System.Collections.Concurrent;
using System.Globalization;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.PhOnboarding;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Handles the CSV/XLSX bulk import wizard for units and owners: column-mapping suggestion,
/// row-level validation with a preview, and an all-or-nothing commit.
/// Import sessions are kept in an in-memory, tenant-scoped cache (single-process; not durable
/// across app restarts) and expire after <see cref="SessionLifetime"/>.
/// </summary>
public sealed class PhImportService
{
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(1);
    private static readonly ConcurrentDictionary<Guid, ImportSession> Sessions = new();

    private const int MaxRows = 5000;
    private const int MaxSampleRows = 50;

    private static readonly string[] SystemFields =
    [
        "UnitCode", "Tower", "Floor", "CoefficientPercent", "FirstName", "LastName", "Identification", "Email", "Phone"
    ];

    private static readonly Dictionary<string, string[]> FieldSynonyms = new(StringComparer.OrdinalIgnoreCase)
    {
        ["UnitCode"] = ["unidad", "apartamento", "apto", "unit", "unitcode", "codigo", "codigounidad"],
        ["Tower"] = ["torre", "tower", "bloque", "block", "edificio"],
        ["Floor"] = ["piso", "floor", "nivel", "level"],
        ["CoefficientPercent"] = ["coeficiente", "coef", "coefficient", "coeficientepercent", "porcentaje", "coefficientpercent"],
        ["FirstName"] = ["nombre", "nombres", "firstname", "primernombre"],
        ["LastName"] = ["apellido", "apellidos", "lastname"],
        ["Identification"] = ["identificacion", "cedula", "id", "documento", "dni", "identification", "nit"],
        ["Email"] = ["email", "correo", "correoelectronico", "mail"],
        ["Phone"] = ["telefono", "phone", "celular", "movil", "tel", "whatsapp"]
    };

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

    public async Task<ImportAnalyzeResultDto> AnalyzeCsvAsync(
        Guid propertyHorizontalId,
        Stream csvStream,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(csvStream);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        using var reader = new StreamReader(csvStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var content = await reader.ReadToEndAsync(cancellationToken);
        var table = ParseCsv(content.TrimStart('\uFEFF'));

        if (table.Count == 0)
        {
            throw new DomainException("IMPORT_FILE_EMPTY", "The file has no rows.");
        }

        var headers = table[0].Select(h => h.Trim()).ToList();
        var dataRows = table.Skip(1).Where(r => r.Any(c => !string.IsNullOrWhiteSpace(c))).ToList();

        return CreateSession(propertyHorizontalId, headers, dataRows);
    }

    /// <summary>
    /// Analyzes a pre-parsed tabular payload (e.g. an XLSX workbook parsed by Infrastructure/controller
    /// via ClosedXML). This service intentionally does not depend on a spreadsheet library.
    /// </summary>
    public async Task<ImportAnalyzeResultDto> AnalyzeXlsxAsync(
        Guid propertyHorizontalId,
        IReadOnlyList<string> headers,
        IReadOnlyList<string[]> rows,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(headers);
        ArgumentNullException.ThrowIfNull(rows);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsurePhAccessAsync(propertyHorizontalId, cancellationToken);

        if (headers.Count == 0)
        {
            throw new DomainException("IMPORT_FILE_EMPTY", "The file has no header row.");
        }

        var trimmedHeaders = headers.Select(h => h.Trim()).ToList();
        var dataRows = rows.Where(r => r.Any(c => !string.IsNullOrWhiteSpace(c))).ToList();

        return CreateSession(propertyHorizontalId, trimmedHeaders, dataRows);
    }

    public async Task<ImportPreviewDto> ValidateAsync(
        ImportValidateRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var session = GetSession(request.SessionId);
        await EnsurePhAccessAsync(session.PropertyHorizontalId, cancellationToken);
        EnsureRequiredMappingsPresent(request.Mappings);

        var (rows, issues) = await ValidateRowsAsync(session, request.Mappings, cancellationToken);

        var errorRowNumbers = issues.Where(i => i.Severity == "Error").Select(i => i.RowNumber).ToHashSet();
        var warningRowNumbers = issues.Where(i => i.Severity == "Warning").Select(i => i.RowNumber).ToHashSet();

        var previewRows = rows
            .Select(r => new ImportPreviewRowDto(
                r.RowNumber, r.UnitCode, r.Tower, r.Floor, r.CoefficientPercent,
                r.FirstName, r.LastName, r.Identification, r.Email, r.Phone,
                !errorRowNumbers.Contains(r.RowNumber)))
            .ToList();

        session.LastIssues = issues;

        var errorRows = errorRowNumbers.Count;
        var warningRows = warningRowNumbers.Except(errorRowNumbers).Count();
        var validRows = rows.Count - errorRows;

        return new ImportPreviewDto(
            session.SessionId,
            rows.Count,
            validRows,
            warningRows,
            errorRows,
            issues,
            previewRows.Take(MaxSampleRows).ToList());
    }

    public async Task<ImportCommitResultDto> CommitAsync(
        ImportValidateRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var session = GetSession(request.SessionId);
        await EnsurePhAccessAsync(session.PropertyHorizontalId, cancellationToken);
        EnsureRequiredMappingsPresent(request.Mappings);

        var (rows, issues) = await ValidateRowsAsync(session, request.Mappings, cancellationToken);
        var errorRowNumbers = issues.Where(i => i.Severity == "Error").Select(i => i.RowNumber).ToHashSet();

        if (rows.Count > 0 && errorRowNumbers.Count == rows.Count)
        {
            throw new DomainException("IMPORT_ALL_ROWS_INVALID", "All rows have blocking errors. Fix the file and try again.");
        }

        var propertyHorizontalId = session.PropertyHorizontalId;
        var tenantId = session.TenantId;

        var unitByCode = (await _db.Units
                .Where(u => u.PropertyHorizontalId == propertyHorizontalId)
                .ToListAsync(cancellationToken))
            .ToDictionary(u => u.Code, StringComparer.OrdinalIgnoreCase);

        var existingOwners = await _db.Owners.Where(o => o.TenantId == tenantId).ToListAsync(cancellationToken);
        var ownerByEmail = existingOwners.ToDictionary(o => o.Email, StringComparer.OrdinalIgnoreCase);
        var ownerByIdentification = new Dictionary<string, Owner>(StringComparer.OrdinalIgnoreCase);
        foreach (var owner in existingOwners)
        {
            if (!string.IsNullOrWhiteSpace(owner.Identification))
            {
                ownerByIdentification.TryAdd(owner.Identification, owner);
            }
        }

        var existingOwnershipKeys = new HashSet<(Guid UnitId, Guid OwnerId)>(
            (await _db.Ownerships
                .Where(o => o.TenantId == tenantId)
                .Select(o => new { o.UnitId, o.OwnerId })
                .ToListAsync(cancellationToken))
            .Select(x => (x.UnitId, x.OwnerId)));

        var processedRowKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var unitsCreated = 0;
        var ownersCreated = 0;
        var ownershipsCreated = 0;
        var skipped = 0;

        foreach (var row in rows)
        {
            if (errorRowNumbers.Contains(row.RowNumber))
            {
                skipped++;
                continue;
            }

            var code = row.UnitCode!.Trim();
            var email = row.Email!.Trim().ToLowerInvariant();
            var rowKey = $"{code}|{email}";
            if (!processedRowKeys.Add(rowKey))
            {
                skipped++;
                continue;
            }

            if (!unitByCode.TryGetValue(code, out var unit))
            {
                unit = new Unit
                {
                    TenantId = tenantId,
                    PropertyHorizontalId = propertyHorizontalId,
                    Code = code,
                    Tower = row.Tower,
                    Floor = row.Floor,
                    CoefficientPercent = CoefficientValidator.Normalize(row.CoefficientPercent ?? 0m),
                    IsActive = true
                };
                _db.Units.Add(unit);
                unitByCode[code] = unit;
                unitsCreated++;
            }
            else if (row.CoefficientPercent is decimal coefficient && unit.CoefficientPercent == 0m)
            {
                // Only backfill when the existing unit has no coefficient yet, to avoid silently
                // overwriting values curated outside the import file.
                unit.CoefficientPercent = CoefficientValidator.Normalize(coefficient);
            }

            Owner? owner = null;
            if (ownerByEmail.TryGetValue(email, out var byEmail))
            {
                owner = byEmail;
            }
            else if (!string.IsNullOrWhiteSpace(row.Identification)
                     && ownerByIdentification.TryGetValue(row.Identification.Trim(), out var byIdentification))
            {
                owner = byIdentification;
            }

            if (owner is null)
            {
                owner = new Owner
                {
                    TenantId = tenantId,
                    DisplayName = PhOnboardingSupport.BuildDisplayName(row.FirstName, row.LastName, null, email),
                    FirstName = row.FirstName,
                    LastName = row.LastName,
                    Identification = row.Identification,
                    Email = email,
                    Phone = row.Phone,
                    Status = OwnerLifecycleStatus.Draft
                };
                _db.Owners.Add(owner);
                ownerByEmail[email] = owner;
                if (!string.IsNullOrWhiteSpace(row.Identification))
                {
                    ownerByIdentification.TryAdd(row.Identification.Trim(), owner);
                }

                ownersCreated++;
            }

            var ownershipKey = (unit.Id, owner.Id);
            if (existingOwnershipKeys.Add(ownershipKey))
            {
                _db.Ownerships.Add(new Ownership
                {
                    TenantId = tenantId,
                    UnitId = unit.Id,
                    OwnerId = owner.Id,
                    SharePercent = 100m,
                    EffectiveFromUtc = DateTimeOffset.UtcNow,
                    IsActive = true
                });
                ownershipsCreated++;
            }
            else
            {
                skipped++;
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        Sessions.TryRemove(session.SessionId, out _);

        await _audit.WriteAsync(
            "BulkImport",
            correlationId: propertyHorizontalId,
            metadata: new { unitsCreated, ownersCreated, ownershipsCreated, skipped },
            cancellationToken: cancellationToken);

        var remainingIssues = issues.Where(i => errorRowNumbers.Contains(i.RowNumber)).ToList();
        return new ImportCommitResultDto(unitsCreated, ownersCreated, ownershipsCreated, skipped, remainingIssues);
    }

    public byte[] DownloadTemplate()
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        return _workbook.BuildTemplate();
    }

    public byte[] BuildErrorReport(Guid sessionId)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var session = GetSession(sessionId);
        var issues = session.LastIssues
            ?? throw new DomainException("IMPORT_NOT_VALIDATED", "Run validation before requesting an error report.");

        var rows = issues
            .Select(i => (Row: i.RowNumber, Field: i.Field, Value: i.Value, Problem: i.Problem, Action: i.SuggestedAction))
            .ToList();

        return _workbook.BuildErrorReport(rows);
    }

    private void EnsureRequiredMappingsPresent(IReadOnlyList<ImportColumnMappingDto> mappings)
    {
        ArgumentNullException.ThrowIfNull(mappings);

        bool IsMapped(string field) =>
            mappings.Any(m => string.Equals(m.SystemField, field, StringComparison.Ordinal) && !string.IsNullOrWhiteSpace(m.SourceColumn));

        var missing = new List<string>();
        if (!IsMapped("UnitCode"))
        {
            missing.Add("UnitCode");
        }

        if (!IsMapped("Email"))
        {
            missing.Add("Email");
        }

        if (missing.Count > 0)
        {
            throw new DomainException(
                "IMPORT_MAPPING_INCOMPLETE",
                $"Map the following required fields before continuing: {string.Join(", ", missing)}.");
        }
    }

    private async Task<(IReadOnlyList<ParsedImportRow> Rows, IReadOnlyList<ImportRowIssueDto> Issues)> ValidateRowsAsync(
        ImportSession session,
        IReadOnlyList<ImportColumnMappingDto> mappings,
        CancellationToken cancellationToken)
    {
        var columns = ResolveColumnIndexes(session.Headers, mappings);
        var parsed = ParseRows(session.Rows, columns);

        var existingOwners = await _db.Owners
            .AsNoTracking()
            .Where(o => o.TenantId == session.TenantId)
            .ToListAsync(cancellationToken);

        var ownersByEmail = existingOwners.ToDictionary(o => o.Email, StringComparer.OrdinalIgnoreCase);
        var ownersByIdentification = new Dictionary<string, Owner>(StringComparer.OrdinalIgnoreCase);
        foreach (var owner in existingOwners)
        {
            if (!string.IsNullOrWhiteSpace(owner.Identification))
            {
                ownersByIdentification.TryAdd(owner.Identification, owner);
            }
        }

        var issues = new List<ImportRowIssueDto>();
        var seenUnitOwnerKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var unitCoefficients = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        var identificationRows = new Dictionary<string, (string Email, int RowNumber)>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in parsed)
        {
            void AddIssue(string field, string? value, string problem, string action, string severity) =>
                issues.Add(new ImportRowIssueDto(row.RowNumber, field, value, problem, action, severity));

            if (string.IsNullOrWhiteSpace(row.UnitCode))
            {
                AddIssue("UnitCode", row.UnitCode, "Unit code is required.", "Map a column to Unit Code or fill in the cell.", "Error");
            }

            if (string.IsNullOrWhiteSpace(row.Email))
            {
                AddIssue("Email", row.Email, "Email is required.", "Map a column to Email or fill in the cell.", "Error");
            }
            else if (!PhOnboardingSupport.IsValidEmail(row.Email))
            {
                AddIssue("Email", row.Email, "Email format is invalid.", "Correct the email address.", "Error");
            }

            if (row.FloorParseFailed)
            {
                AddIssue("Floor", null, "Floor must be a whole number.", "Fix the value or unmap the column.", "Error");
            }

            if (row.CoefficientParseFailed)
            {
                AddIssue("CoefficientPercent", null, "Coefficient must be a decimal number.", "Fix the value or unmap the column.", "Error");
            }
            else if (row.CoefficientPercent is decimal coefficient && (coefficient < 0 || coefficient > 100))
            {
                AddIssue(
                    "CoefficientPercent",
                    coefficient.ToString(CultureInfo.InvariantCulture),
                    "Coefficient must be between 0 and 100.",
                    "Correct the value.",
                    "Error");
            }

            if (!string.IsNullOrWhiteSpace(row.UnitCode) && !string.IsNullOrWhiteSpace(row.Email))
            {
                var key = $"{row.UnitCode.Trim()}|{row.Email.Trim()}";
                if (!seenUnitOwnerKeys.Add(key))
                {
                    AddIssue(
                        "UnitCode", row.UnitCode, "Duplicate unit/owner combination within the file.",
                        "Remove the duplicate row.", "Warning");
                }
            }

            if (!string.IsNullOrWhiteSpace(row.UnitCode) && row.CoefficientPercent is decimal c)
            {
                var normalizedCode = row.UnitCode.Trim();
                if (unitCoefficients.TryGetValue(normalizedCode, out var previous))
                {
                    if (Math.Abs(previous - c) > CoefficientValidator.Tolerance)
                    {
                        AddIssue(
                            "CoefficientPercent",
                            c.ToString(CultureInfo.InvariantCulture),
                            $"Unit '{normalizedCode}' has conflicting coefficient values in the file ({previous.ToString(CultureInfo.InvariantCulture)} vs {c.ToString(CultureInfo.InvariantCulture)}).",
                            "Use the same coefficient for every row referencing this unit.",
                            "Warning");
                    }
                }
                else
                {
                    unitCoefficients[normalizedCode] = c;
                }
            }

            if (!string.IsNullOrWhiteSpace(row.Identification))
            {
                var idKey = row.Identification.Trim();
                if (identificationRows.TryGetValue(idKey, out var prior))
                {
                    if (!string.Equals(prior.Email, row.Email, StringComparison.OrdinalIgnoreCase))
                    {
                        AddIssue(
                            "Identification", row.Identification,
                            $"Identification '{idKey}' was already used in row {prior.RowNumber} with a different email.",
                            "Verify the identification number or the email.", "Warning");
                    }
                }
                else
                {
                    identificationRows[idKey] = (row.Email ?? string.Empty, row.RowNumber);
                }
            }

            EvaluatePossibleDuplicateOwner(row, ownersByEmail, ownersByIdentification, existingOwners, AddIssue);
        }

        return (parsed, issues);
    }

    private static void EvaluatePossibleDuplicateOwner(
        ParsedImportRow row,
        IReadOnlyDictionary<string, Owner> ownersByEmail,
        IReadOnlyDictionary<string, Owner> ownersByIdentification,
        IReadOnlyList<Owner> allOwners,
        Action<string, string?, string, string, string> addIssue)
    {
        if (string.IsNullOrWhiteSpace(row.FirstName) && string.IsNullOrWhiteSpace(row.LastName))
        {
            return;
        }

        var incomingName = PhOnboardingSupport.BuildDisplayName(row.FirstName, row.LastName, null, row.Email ?? string.Empty);
        if (string.IsNullOrWhiteSpace(incomingName))
        {
            return;
        }

        Owner? matched = null;
        if (!string.IsNullOrWhiteSpace(row.Email) && ownersByEmail.TryGetValue(row.Email.Trim(), out var byEmail))
        {
            matched = byEmail;
        }
        else if (!string.IsNullOrWhiteSpace(row.Identification) && ownersByIdentification.TryGetValue(row.Identification.Trim(), out var byId))
        {
            matched = byId;
        }

        if (matched is not null)
        {
            if (!string.Equals(matched.Email, row.Email, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(
                    PhOnboardingSupport.NormalizeForComparison(incomingName),
                    PhOnboardingSupport.NormalizeForComparison(matched.DisplayName),
                    StringComparison.Ordinal))
            {
                addIssue(
                    "LastName", incomingName,
                    $"Row name '{incomingName}' differs from the existing owner matched by identification ('{matched.DisplayName}').",
                    "Confirm this is the same person before committing.", "Warning");
            }

            return;
        }

        var similar = allOwners.FirstOrDefault(o =>
            !string.Equals(o.Email, row.Email, StringComparison.OrdinalIgnoreCase)
            && string.Equals(PhOnboardingSupport.NormalizeForComparison(o.DisplayName), PhOnboardingSupport.NormalizeForComparison(incomingName), StringComparison.Ordinal));

        if (similar is not null)
        {
            addIssue(
                "FirstName", incomingName,
                $"Possible duplicate owner: '{incomingName}' is similar to existing owner '{similar.DisplayName}' ({similar.Email}) but uses a different email. Owners are not merged automatically by name alone.",
                "Verify before creating a new owner.", "Warning");
        }
    }

    private void PurgeExpiredSessions()
    {
        var cutoff = DateTimeOffset.UtcNow - SessionLifetime;
        foreach (var (id, session) in Sessions)
        {
            if (session.CreatedAtUtc < cutoff)
            {
                Sessions.TryRemove(id, out _);
            }
        }
    }

    private ImportAnalyzeResultDto CreateSession(
        Guid propertyHorizontalId,
        IReadOnlyList<string> headers,
        IReadOnlyList<string[]> rows)
    {
        PurgeExpiredSessions();

        if (rows.Count == 0)
        {
            throw new DomainException("IMPORT_FILE_EMPTY", "The file has no data rows.");
        }

        if (rows.Count > MaxRows)
        {
            throw new DomainException("IMPORT_TOO_MANY_ROWS", $"The file has too many rows (maximum {MaxRows}).");
        }

        var session = new ImportSession
        {
            SessionId = Guid.NewGuid(),
            TenantId = _currentTenant.TenantId,
            PropertyHorizontalId = propertyHorizontalId,
            CreatedByUserId = TenantGuard.RequireUserId(_currentTenant),
            CreatedAtUtc = DateTimeOffset.UtcNow,
            Headers = headers,
            Rows = rows
        };

        Sessions[session.SessionId] = session;

        return new ImportAnalyzeResultDto(session.SessionId, headers, SuggestMappings(headers), rows.Count);
    }

    private ImportSession GetSession(Guid sessionId)
    {
        PurgeExpiredSessions();

        if (!Sessions.TryGetValue(sessionId, out var session))
        {
            throw new DomainException("IMPORT_SESSION_NOT_FOUND", "Import session not found or expired. Please upload the file again.");
        }

        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);
        return session;
    }

    private async Task EnsurePhAccessAsync(Guid propertyHorizontalId, CancellationToken cancellationToken)
    {
        var ph = await _db.PropertyHorizontals.AsNoTracking().FirstOrDefaultAsync(p => p.Id == propertyHorizontalId, cancellationToken)
            ?? throw new DomainException("PH_NOT_FOUND", "Property horizontal not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, ph.TenantId);
    }

    private static Dictionary<string, int?> ResolveColumnIndexes(
        IReadOnlyList<string> headers,
        IReadOnlyList<ImportColumnMappingDto> mappings)
    {
        var headerIndex = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < headers.Count; i++)
        {
            headerIndex.TryAdd(headers[i], i);
        }

        var result = new Dictionary<string, int?>(StringComparer.Ordinal);
        foreach (var mapping in mappings)
        {
            result[mapping.SystemField] = !string.IsNullOrWhiteSpace(mapping.SourceColumn)
                && headerIndex.TryGetValue(mapping.SourceColumn, out var idx)
                ? idx
                : null;
        }

        foreach (var field in SystemFields)
        {
            result.TryAdd(field, null);
        }

        return result;
    }

    private static IReadOnlyList<ParsedImportRow> ParseRows(IReadOnlyList<string[]> rows, IReadOnlyDictionary<string, int?> columns)
    {
        var result = new List<ParsedImportRow>(rows.Count);

        for (var i = 0; i < rows.Count; i++)
        {
            var row = rows[i];
            var rowNumber = i + 2; // Row 1 is the header.

            var floorRaw = GetValue(row, columns["Floor"]);
            int? floor = null;
            var floorFailed = false;
            if (!string.IsNullOrWhiteSpace(floorRaw))
            {
                if (int.TryParse(floorRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedFloor))
                {
                    floor = parsedFloor;
                }
                else
                {
                    floorFailed = true;
                }
            }

            var coefficientRaw = GetValue(row, columns["CoefficientPercent"]);
            decimal? coefficient = null;
            var coefficientFailed = false;
            if (!string.IsNullOrWhiteSpace(coefficientRaw))
            {
                var normalized = coefficientRaw.Replace("%", string.Empty).Trim();
                if (decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsedCoefficient)
                    || decimal.TryParse(normalized.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out parsedCoefficient))
                {
                    coefficient = parsedCoefficient;
                }
                else
                {
                    coefficientFailed = true;
                }
            }

            result.Add(new ParsedImportRow(
                rowNumber,
                GetValue(row, columns["UnitCode"]),
                GetValue(row, columns["Tower"]),
                floor,
                floorFailed,
                coefficient,
                coefficientFailed,
                GetValue(row, columns["FirstName"]),
                GetValue(row, columns["LastName"]),
                GetValue(row, columns["Identification"]),
                GetValue(row, columns["Email"])?.ToLowerInvariant(),
                GetValue(row, columns["Phone"])));
        }

        return result;
    }

    private static string? GetValue(string[] row, int? columnIndex) =>
        columnIndex is int idx && idx >= 0 && idx < row.Length ? PhOnboardingSupport.Trim(row[idx]) : null;

    /// <summary>Minimal RFC 4180-style CSV parser: handles quoted fields, escaped quotes and CRLF/LF.</summary>
    internal static IReadOnlyList<string[]> ParseCsv(string content)
    {
        var rows = new List<string[]>();
        var field = new StringBuilder();
        var row = new List<string>();
        var inQuotes = false;
        var i = 0;
        var length = content.Length;

        void EndField()
        {
            row.Add(field.ToString());
            field.Clear();
        }

        void EndRow()
        {
            EndField();
            rows.Add(row.ToArray());
            row = [];
        }

        while (i < length)
        {
            var c = content[i];

            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < length && content[i + 1] == '"')
                    {
                        field.Append('"');
                        i += 2;
                        continue;
                    }

                    inQuotes = false;
                    i++;
                    continue;
                }

                field.Append(c);
                i++;
                continue;
            }

            switch (c)
            {
                case '"':
                    inQuotes = true;
                    i++;
                    break;
                case ',':
                    EndField();
                    i++;
                    break;
                case '\r':
                    i++;
                    break;
                case '\n':
                    EndRow();
                    i++;
                    break;
                default:
                    field.Append(c);
                    i++;
                    break;
            }
        }

        if (field.Length > 0 || row.Count > 0)
        {
            EndRow();
        }

        return rows.Where(r => r.Length > 1 || !string.IsNullOrWhiteSpace(r[0])).ToList();
    }

    private static IReadOnlyList<ImportColumnMappingDto> SuggestMappings(IReadOnlyList<string> headers)
    {
        var normalizedHeaders = headers.Select(h => (Original: h, Normalized: PhOnboardingSupport.NormalizeForComparison(h))).ToList();
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var mappings = new List<ImportColumnMappingDto>();

        foreach (var field in SystemFields)
        {
            var synonyms = FieldSynonyms[field];
            var normalizedField = PhOnboardingSupport.NormalizeForComparison(field);

            string? match = normalizedHeaders
                .Where(h => !used.Contains(h.Original))
                .Where(h => h.Normalized == normalizedField || synonyms.Any(s => h.Normalized == PhOnboardingSupport.NormalizeForComparison(s)))
                .Select(h => h.Original)
                .FirstOrDefault();

            match ??= normalizedHeaders
                .Where(h => !used.Contains(h.Original))
                .Where(h => synonyms.Any(s => h.Normalized.Contains(PhOnboardingSupport.NormalizeForComparison(s), StringComparison.Ordinal)))
                .Select(h => h.Original)
                .FirstOrDefault();

            if (match is not null)
            {
                used.Add(match);
            }

            mappings.Add(new ImportColumnMappingDto(field, match));
        }

        return mappings;
    }

    private sealed class ImportSession
    {
        public required Guid SessionId { get; init; }

        public required Guid TenantId { get; init; }

        public required Guid PropertyHorizontalId { get; init; }

        public required Guid CreatedByUserId { get; init; }

        public required DateTimeOffset CreatedAtUtc { get; init; }

        public required IReadOnlyList<string> Headers { get; init; }

        public required IReadOnlyList<string[]> Rows { get; init; }

        public IReadOnlyList<ImportRowIssueDto>? LastIssues { get; set; }
    }

    private sealed record ParsedImportRow(
        int RowNumber,
        string? UnitCode,
        string? Tower,
        int? Floor,
        bool FloorParseFailed,
        decimal? CoefficientPercent,
        bool CoefficientParseFailed,
        string? FirstName,
        string? LastName,
        string? Identification,
        string? Email,
        string? Phone);
}
