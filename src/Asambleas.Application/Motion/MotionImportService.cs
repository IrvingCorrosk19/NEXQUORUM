namespace Asambleas.Application.Motion;

using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Motions;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
using Microsoft.EntityFrameworkCore;

public sealed class MotionImportService
{
    public const int MaxRows = 200;
    public const int MaxFileBytes = 2 * 1024 * 1024;
    public const int MaxCellLength = 8000;
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(1);
    private static readonly ConcurrentDictionary<Guid, ImportSession> Sessions = new();
    private static readonly ConcurrentDictionary<string, MotionImportCommitResultDto> Idempotency =
        new(StringComparer.Ordinal);

    private static readonly string[] RequiredHeaders =
    [
        "Orden", "PuntoAgenda", "TituloCorto", "Pregunta", "TipoRespuesta",
        "Opcion1", "Opcion2", "Metodo", "Mayoria", "VisibilidadResultado", "VotoSecreto"
    ];

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IMotionImportWorkbookService _workbook;
    private readonly MotionService _motions;
    private readonly IAuditService _audit;

    public MotionImportService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IMotionImportWorkbookService workbook,
        MotionService motions,
        IAuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _workbook = workbook;
        _motions = motions;
        _audit = audit;
    }

    public async Task<MotionImportCatalogsDto> GetCatalogsAsync(Guid assemblyId, CancellationToken ct = default)
    {
        var assembly = await LoadAssemblyAsync(assemblyId, ct);
        var agenda = await _db.AgendaItems.AsNoTracking()
            .Where(a => a.AssemblyId == assemblyId)
            .OrderBy(a => a.Ordinal).ThenBy(a => a.Code)
            .Select(a => new MotionImportAgendaItemDto(a.Id, a.Code, a.Title, a.Ordinal))
            .ToListAsync(ct);

        return new MotionImportCatalogsDto(
            agenda,
            BallotCatalog(),
            MethodCatalog(),
            RuleCatalog(),
            VisibilityCatalog(),
            [new("Si", "Si"), new("No", "No")],
            [new("Borrador", "Borrador"), new("Publicar", "Publicar")],
            MaxRows,
            MaxFileBytes);
    }

    public async Task<(byte[] Bytes, string FileName)> BuildTemplateAsync(Guid assemblyId, CancellationToken ct = default)
    {
        var catalogs = await GetCatalogsAsync(assemblyId, ct);
        var assembly = await LoadAssemblyAsync(assemblyId, ct);
        var bytes = _workbook.BuildTemplate(
            catalogs.AgendaItems.Select(a => (a.Code, a.Title)).ToList(),
            catalogs.BallotKinds.Select(x => (x.Code, x.Label)).ToList(),
            catalogs.CalculationMethods.Select(x => (x.Code, x.Label)).ToList(),
            catalogs.DecisionRules.Select(x => (x.Code, x.Label)).ToList(),
            catalogs.ResultVisibility.Select(x => (x.Code, x.Label)).ToList(),
            assembly.Title);
        var safe = "preguntas-" + assemblyId.ToString("N")[..8] + ".xlsx";
        return (bytes, safe);
    }

    public async Task<MotionImportPreviewDto> AnalyzeXlsxAsync(Guid assemblyId, Stream stream, string? fileName, CancellationToken ct = default)
    {
        await LoadAssemblyAsync(assemblyId, ct);
        EnsureStreamSize(stream);
        var (headers, rows) = _workbook.ParseWorkbook(stream);
        return await BuildPreviewAsync(assemblyId, headers, rows, fileName, "xlsx", ct);
    }

    public async Task<MotionImportPreviewDto> AnalyzeCsvAsync(Guid assemblyId, Stream stream, string? fileName, CancellationToken ct = default)
    {
        await LoadAssemblyAsync(assemblyId, ct);
        EnsureStreamSize(stream);
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        var content = (await reader.ReadToEndAsync(ct)).TrimStart('\uFEFF');
        var table = ParseCsv(content);
        if (table.Count == 0) throw new DomainException("IMPORT_FILE_EMPTY", "El archivo no tiene filas.");
        var headers = table[0].Select(h => h.Trim()).ToList();
        var data = table.Skip(1).Where(r => r.Any(c => !string.IsNullOrWhiteSpace(c))).ToList();
        return await BuildPreviewAsync(assemblyId, headers, data, fileName, "csv", ct);
    }

    public async Task<MotionImportPreviewDto> PatchRowAsync(Guid assemblyId, MotionImportRowPatchRequest request, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        await LoadAssemblyAsync(assemblyId, ct);
        var session = GetSession(request.SessionId, assemblyId);
        var row = session.Rows.FirstOrDefault(r => r.RowNumber == request.RowNumber)
            ?? throw new DomainException("IMPORT_ROW_NOT_FOUND", "No encontramos esa fila en la vista previa.");

        if (request.Orden.HasValue) row.Orden = request.Orden;
        if (request.PuntoAgenda is not null) row.PuntoAgenda = request.PuntoAgenda.Trim();
        if (request.Codigo is not null) row.Codigo = request.Codigo.Trim();
        if (request.TituloCorto is not null) row.TituloCorto = request.TituloCorto.Trim();
        if (request.Pregunta is not null) row.Pregunta = request.Pregunta.Trim();
        if (request.Instrucciones is not null) row.Instrucciones = request.Instrucciones.Trim();
        if (request.TipoRespuesta is not null) row.TipoRespuesta = request.TipoRespuesta.Trim();
        if (request.Opcion1 is not null) row.Opcion1 = request.Opcion1.Trim();
        if (request.Opcion2 is not null) row.Opcion2 = request.Opcion2.Trim();
        if (request.Opcion3 is not null) row.Opcion3 = request.Opcion3.Trim();
        if (request.Opcion4 is not null) row.Opcion4 = request.Opcion4.Trim();
        if (request.Opcion5 is not null) row.Opcion5 = request.Opcion5.Trim();
        if (request.Metodo is not null) row.Metodo = request.Metodo.Trim();
        if (request.Mayoria is not null) row.Mayoria = request.Mayoria.Trim();
        if (request.UmbralPorcentaje.HasValue) row.UmbralPorcentaje = request.UmbralPorcentaje;
        if (request.VisibilidadResultado is not null) row.VisibilidadResultado = request.VisibilidadResultado.Trim();
        if (request.VotoSecreto is not null) row.VotoSecreto = request.VotoSecreto.Trim();
        if (request.EstadoImportacion is not null) row.EstadoImportacion = request.EstadoImportacion.Trim();
        if (request.Included.HasValue) row.Included = request.Included.Value;

        await ValidateSessionRowsAsync(session, ct);
        return ToPreview(session);
    }

    public async Task<MotionImportCommitResultDto> CommitAsync(Guid assemblyId, MotionImportCommitRequest request, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        var assembly = await LoadAssemblyAsync(assemblyId, ct);

        if (!string.IsNullOrWhiteSpace(request.ClientRequestId))
        {
            var key = assemblyId + ":" + request.ClientRequestId.Trim();
            if (Idempotency.TryGetValue(key, out var prior)) return prior with { IdempotentReplay = true };
        }

        var session = GetSession(request.SessionId, assemblyId);
        await ValidateSessionRowsAsync(session, ct);

        var included = session.Rows.Where(r => r.Included).ToList();
        if (included.Count == 0)
            throw new DomainException("IMPORT_EMPTY", "No hay filas incluidas para importar.");
        if (included.Any(r => r.Status == "Error"))
            throw new DomainException("IMPORT_HAS_ERRORS", "Corrija las filas con errores antes de importar.");

        if (_db is not DbContext ef)
            throw new InvalidOperationException("Import requires EF Core DbContext.");

        await using var tx = await ef.Database.BeginTransactionAsync(ct);
        var createdIds = new List<Guid>();
        var published = 0;
        try
        {
            var ordered = included.OrderBy(r => r.Orden ?? int.MaxValue).ThenBy(r => r.RowNumber).ToList();
            var maxOrder = await _db.Motions.Where(m => m.AssemblyId == assemblyId)
                .Select(m => (int?)m.DisplayOrder).MaxAsync(ct) ?? 0;

            foreach (var row in ordered)
            {
                maxOrder++;
                var create = ToCreateRequest(row, maxOrder);
                var dto = await _motions.CreateAsync(assemblyId, create, ct);
                createdIds.Add(dto.Id);

                var wantPublish = request.PublishReadyRows
                    || string.Equals(row.EstadoImportacionResolved, VotingDesignCodes.DesignStatus.Ready, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(row.EstadoImportacion, "Publicar", StringComparison.OrdinalIgnoreCase);
                if (wantPublish)
                {
                    await _motions.PublishAsync(assemblyId, dto.Id, ct);
                    published++;
                }
            }

            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        await _audit.WriteAsync(
            AuditEventType.MotionBulkImported,
            assemblyId,
            metadata: new
            {
                session.SessionId,
                session.SafeFileName,
                session.FileHash,
                session.SourceKind,
                Rows = included.Count,
                Imported = createdIds.Count,
                Published = published,
                MotionIds = createdIds
            },
            cancellationToken: ct);

        var result = new MotionImportCommitResultDto(session.SessionId, createdIds.Count, published, createdIds);
        if (!string.IsNullOrWhiteSpace(request.ClientRequestId))
        {
            Idempotency[assemblyId + ":" + request.ClientRequestId.Trim()] = result;
        }

        Sessions.TryRemove(session.SessionId, out _);
        return result;
    }

    public async Task<BulkPublishMotionsResultDto> BulkPublishAsync(Guid assemblyId, BulkPublishMotionsRequest request, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        await LoadAssemblyAsync(assemblyId, ct);
        var updated = new List<Guid>();
        var skips = new List<string>();
        foreach (var id in request.MotionIds.Distinct())
        {
            try
            {
                var dto = await _motions.PublishAsync(assemblyId, id, ct);
                updated.Add(dto.Id);
            }
            catch (DomainException ex)
            {
                skips.Add($"{id}: {ex.Message}");
            }
        }

        return new BulkPublishMotionsResultDto(
            request.MotionIds.Count,
            updated.Count,
            skips.Count,
            updated,
            skips);
    }

    private async Task<MotionImportPreviewDto> BuildPreviewAsync(
        Guid assemblyId,
        IReadOnlyList<string> headers,
        IReadOnlyList<string[]> rows,
        string? fileName,
        string kind,
        CancellationToken ct)
    {
        if (headers.Count == 0)
            throw new DomainException("IMPORT_FILE_EMPTY", "El archivo no tiene encabezados.");
        if (rows.Count > MaxRows)
            throw new DomainException("IMPORT_TOO_MANY_ROWS", $"El archivo supera el maximo de {MaxRows} preguntas.");

        foreach (var req in RequiredHeaders)
        {
            if (!headers.Any(h => NormalizeHeader(h) == NormalizeHeader(req)))
                throw new DomainException("IMPORT_HEADERS", $"Falta la columna obligatoria '{req}'.");
        }

        var map = BuildHeaderMap(headers);
        var session = new ImportSession
        {
            SessionId = Guid.NewGuid(),
            AssemblyId = assemblyId,
            TenantId = _currentTenant.TenantId,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            SourceKind = kind,
            SafeFileName = SanitizeFileName(fileName),
            FileHash = ComputeHash(headers, rows)
        };

        var rowNum = 1;
        foreach (var raw in rows)
        {
            rowNum++;
            session.Rows.Add(ParseRow(rowNum, map, raw));
        }

        await ValidateSessionRowsAsync(session, ct);
        Sessions[session.SessionId] = session;
        SweepExpired();
        return ToPreview(session);
    }

    private async Task ValidateSessionRowsAsync(ImportSession session, CancellationToken ct)
    {
        var agenda = await _db.AgendaItems.AsNoTracking()
            .Where(a => a.AssemblyId == session.AssemblyId)
            .ToListAsync(ct);
        var agendaByCode = agenda.ToDictionary(a => a.Code.Trim(), a => a, StringComparer.OrdinalIgnoreCase);
        var existingCodes = await _db.Motions.AsNoTracking()
            .Where(m => m.AssemblyId == session.AssemblyId && m.DesignStatus != VotingDesignCodes.DesignStatus.Archived)
            .Select(m => m.Code)
            .ToListAsync(ct);
        var existingSet = new HashSet<string>(existingCodes, StringComparer.OrdinalIgnoreCase);

        var orderCounts = session.Rows.Where(r => r.Included && r.Orden.HasValue)
            .GroupBy(r => r.Orden!.Value).ToDictionary(g => g.Key, g => g.Count());
        var codeCounts = session.Rows.Where(r => r.Included && !string.IsNullOrWhiteSpace(r.Codigo))
            .GroupBy(r => r.Codigo!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);

        foreach (var row in session.Rows)
        {
            var errors = new List<string>();
            var warnings = new List<string>();
            if (!row.Included)
            {
                row.Status = "Excluded";
                row.Messages = ["Excluida de la importacion"];
                continue;
            }

            if (row.Orden is null or <= 0) errors.Add("Orden debe ser un numero entero mayor que 0.");
            else if (orderCounts.TryGetValue(row.Orden.Value, out var oc) && oc > 1)
                errors.Add("Orden duplicado en el archivo.");

            if (string.IsNullOrWhiteSpace(row.PuntoAgenda)) errors.Add("Punto de agenda obligatorio.");
            else
            {
                var code = row.PuntoAgenda.Split('—', '–', '-').First().Trim();
                row.PuntoAgendaCode = code;
                if (!agendaByCode.TryGetValue(code, out var item))
                    errors.Add($"Punto de agenda '{code}' no existe en esta asamblea.");
                else
                    row.AgendaItemId = item.Id;
            }

            if (string.IsNullOrWhiteSpace(row.TituloCorto)) errors.Add("Titulo corto obligatorio.");
            else if (row.TituloCorto.Length > 512) errors.Add("Titulo corto demasiado largo.");

            if (string.IsNullOrWhiteSpace(row.Pregunta)) errors.Add("Pregunta obligatoria.");
            else if (row.Pregunta.Length > 2000) errors.Add("Pregunta demasiado larga.");

            var ballot = ResolveBallot(row.TipoRespuesta);
            if (ballot is null) errors.Add("Tipo de respuesta no valido.");
            else row.BallotKindResolved = ballot;

            var method = ResolveMethod(row.Metodo);
            if (method is null) errors.Add("Metodo no valido.");
            else row.MethodResolved = method;

            var rule = ResolveRule(row.Mayoria);
            if (rule is null) errors.Add("Mayoria no valida.");
            else row.RuleResolved = rule;

            if (rule == "QualifiedMajority")
            {
                if (row.UmbralPorcentaje is null or <= 0 or > 100)
                    errors.Add("UmbralPorcentaje obligatorio (0-100] para mayoria calificada.");
            }
            else if (row.UmbralPorcentaje is not null)
            {
                warnings.Add("Umbral presente pero no aplica a esta mayoria; se ignorara.");
            }

            var vis = ResolveVisibility(row.VisibilidadResultado);
            if (vis is null) errors.Add("Visibilidad de resultado no valida.");
            else row.VisibilityResolved = vis;

            var secret = ResolveYesNo(row.VotoSecreto);
            if (secret is null) errors.Add("VotoSecreto debe ser Si o No.");
            else row.IsSecretResolved = secret.Value;

            var state = ResolveImportState(row.EstadoImportacion);
            row.EstadoImportacionResolved = state;

            var options = new[] { row.Opcion1, row.Opcion2, row.Opcion3, row.Opcion4, row.Opcion5 }
                .Where(o => !string.IsNullOrWhiteSpace(o)).Select(o => o!.Trim()).ToList();
            if (options.Count < 2) errors.Add("Se requieren al menos dos opciones.");
            if (options.GroupBy(o => o, StringComparer.OrdinalIgnoreCase).Any(g => g.Count() > 1))
                errors.Add("Hay opciones duplicadas.");
            row.OptionsResolved = options;

            if (string.IsNullOrWhiteSpace(row.Codigo))
            {
                row.CodigoGenerated = true;
                row.Codigo = $"V{row.Orden ?? row.RowNumber:000}";
                warnings.Add($"Codigo generado automaticamente: {row.Codigo}");
            }
            if (row.Codigo!.Length > 64) errors.Add("Codigo demasiado largo.");
            if (codeCounts.TryGetValue(row.Codigo, out var cc) && cc > 1)
                errors.Add("Codigo duplicado en el archivo.");
            if (existingSet.Contains(row.Codigo))
                errors.Add($"El codigo '{row.Codigo}' ya existe en la asamblea.");

            foreach (var cell in new[] { row.TituloCorto, row.Pregunta, row.Instrucciones })
            {
                if (cell is { Length: > MaxCellLength }) errors.Add("Hay celdas que superan el maximo permitido.");
            }

            if (LooksLikeFormula(row.Pregunta) || LooksLikeFormula(row.TituloCorto))
                errors.Add("Se detecto contenido con apariencia de formula; no se permite.");

            if (errors.Count > 0)
            {
                row.Status = "Error";
                row.Messages = errors.Concat(warnings).ToList();
            }
            else if (warnings.Count > 0)
            {
                row.Status = "Warning";
                row.Messages = warnings;
            }
            else
            {
                row.Status = "Ready";
                row.Messages = ["Lista para importar"];
            }
        }
    }

    private static CreateMotionRequest ToCreateRequest(ImportRow row, int displayOrder)
    {
        var optionsJson = JsonSerializer.Serialize(row.OptionsResolved);
        return new CreateMotionRequest(
            row.AgendaItemId ?? Guid.Empty,
            row.Codigo!,
            row.TituloCorto!,
            row.Pregunta!,
            DesignStatus: VotingDesignCodes.DesignStatus.Draft,
            BallotKind: row.BallotKindResolved,
            CalculationMethod: row.MethodResolved,
            DecisionRuleCode: row.RuleResolved,
            RequiredThresholdPercent: row.RuleResolved == "QualifiedMajority" ? row.UmbralPorcentaje : null,
            DefaultResultVisibilityPolicy: row.VisibilityResolved,
            OptionsJson: optionsJson,
            Instructions: row.Instrucciones,
            QuestionText: row.Pregunta,
            IsSecret: row.IsSecretResolved,
            TemplateKey: "bulk-import",
            DisplayOrder: displayOrder);
    }

    private static ImportRow ParseRow(int rowNumber, Dictionary<string, int> map, string[] raw)
    {
        string? Get(string key)
        {
            if (!map.TryGetValue(NormalizeHeader(key), out var idx) || idx >= raw.Length) return null;
            var v = raw[idx]?.Trim();
            return string.IsNullOrWhiteSpace(v) ? null : v;
        }

        int? orden = null;
        if (int.TryParse(Get("Orden"), NumberStyles.Integer, CultureInfo.InvariantCulture, out var o))
            orden = o;

        decimal? umbral = null;
        var umbralRaw = Get("UmbralPorcentaje");
        if (decimal.TryParse(umbralRaw, NumberStyles.Number, CultureInfo.InvariantCulture, out var u)
            || decimal.TryParse(umbralRaw, NumberStyles.Number, new CultureInfo("es-PA"), out u))
            umbral = u;

        return new ImportRow
        {
            RowNumber = rowNumber,
            Included = true,
            Orden = orden,
            PuntoAgenda = Get("PuntoAgenda"),
            Codigo = Get("Codigo"),
            TituloCorto = Get("TituloCorto"),
            Pregunta = Get("Pregunta"),
            Instrucciones = Get("Instrucciones"),
            TipoRespuesta = Get("TipoRespuesta"),
            Opcion1 = Get("Opcion1"),
            Opcion2 = Get("Opcion2"),
            Opcion3 = Get("Opcion3"),
            Opcion4 = Get("Opcion4"),
            Opcion5 = Get("Opcion5"),
            Metodo = Get("Metodo"),
            Mayoria = Get("Mayoria"),
            UmbralPorcentaje = umbral,
            VisibilidadResultado = Get("VisibilidadResultado"),
            VotoSecreto = Get("VotoSecreto"),
            EstadoImportacion = Get("EstadoImportacion") ?? "Borrador"
        };
    }

    private static MotionImportPreviewDto ToPreview(ImportSession session)
    {
        var rows = session.Rows.Select(r => new MotionImportRowPreviewDto(
            r.RowNumber,
            r.Orden,
            r.PuntoAgenda,
            r.Codigo,
            r.TituloCorto,
            r.Pregunta,
            r.TipoRespuesta,
            r.Metodo,
            r.Mayoria,
            r.EstadoImportacion,
            r.Status,
            r.Messages,
            r.Included)).ToList();
        var included = session.Rows.Where(r => r.Included).ToList();
        var errors = included.Count(r => r.Status == "Error");
        var warnings = included.Count(r => r.Status == "Warning");
        var valid = included.Count(r => r.Status is "Ready" or "Warning");
        return new MotionImportPreviewDto(
            session.SessionId,
            included.Count,
            valid,
            errors,
            warnings,
            rows,
            errors == 0 && included.Count > 0);
    }

    private ImportSession GetSession(Guid sessionId, Guid assemblyId)
    {
        if (!Sessions.TryGetValue(sessionId, out var session) || session.ExpiresAtUtc < DateTimeOffset.UtcNow)
            throw new DomainException("IMPORT_SESSION_EXPIRED", "La vista previa expiro. Vuelva a cargar el archivo.");
        if (session.AssemblyId != assemblyId)
            throw new DomainException("IMPORT_SESSION_MISMATCH", "La vista previa no pertenece a esta asamblea.");
        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);
        return session;
    }

    private async Task<Domain.Entities.Assembly> LoadAssemblyAsync(Guid assemblyId, CancellationToken ct)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, ct)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        return assembly;
    }

    private static void EnsureStreamSize(Stream stream)
    {
        if (stream.CanSeek && stream.Length > MaxFileBytes)
            throw new DomainException("IMPORT_FILE_TOO_LARGE", "El archivo supera el tamano maximo permitido (2 MB).");
    }

    private static Dictionary<string, int> BuildHeaderMap(IReadOnlyList<string> headers)
    {
        var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < headers.Count; i++)
        {
            var key = NormalizeHeader(headers[i]);
            if (!string.IsNullOrWhiteSpace(key) && !map.ContainsKey(key))
                map[key] = i;
        }
        return map;
    }

    private static string NormalizeHeader(string? h) =>
        (h ?? "").Trim().Replace("ó", "o").Replace("Ó", "O").Replace("í", "i").Replace("Í", "I")
            .Replace("ú", "u").Replace("Ú", "U").Replace("á", "a").Replace("Á", "A").Replace("é", "e").Replace("É", "E")
            .Replace("ñ", "n").Replace("Ñ", "N").Replace(" ", "");

    private static bool LooksLikeFormula(string? value) =>
        !string.IsNullOrWhiteSpace(value) && (value.StartsWith('=') || value.StartsWith('+') || value.StartsWith('@'));

    private static string? ResolveBallot(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return VotingDesignCodes.Ballot.FavorAgainstAbstain;
        var v = raw.Trim();
        if (ContainsAny(v, "favor", "contra", "absten") || Eq(v, VotingDesignCodes.Ballot.FavorAgainstAbstain))
            return VotingDesignCodes.Ballot.FavorAgainstAbstain;
        if (ContainsAny(v, "si/no/absten", "yesnoabsten") || Eq(v, VotingDesignCodes.Ballot.YesNoAbstain))
            return VotingDesignCodes.Ballot.YesNoAbstain;
        if ((ContainsAny(v, "si/no", "yes/no") && !ContainsAny(v, "absten")) || Eq(v, VotingDesignCodes.Ballot.YesNo))
            return VotingDesignCodes.Ballot.YesNo;
        if (ContainsAny(v, "unica", "single") || Eq(v, VotingDesignCodes.Ballot.SingleChoice))
            return VotingDesignCodes.Ballot.SingleChoice;
        if (ContainsAny(v, "candidat", "multi") || Eq(v, VotingDesignCodes.Ballot.MultiCandidate))
            return VotingDesignCodes.Ballot.MultiCandidate;
        return null;
    }

    private static string? ResolveMethod(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return VotingDesignCodes.Calculation.Coefficient;
        var v = raw.Trim();
        if (ContainsAny(v, "coef") || Eq(v, VotingDesignCodes.Calculation.Coefficient)) return VotingDesignCodes.Calculation.Coefficient;
        if (ContainsAny(v, "persona", "person") || Eq(v, VotingDesignCodes.Calculation.PerPerson)) return VotingDesignCodes.Calculation.PerPerson;
        if (ContainsAny(v, "unidad", "unit") || Eq(v, VotingDesignCodes.Calculation.PerUnit)) return VotingDesignCodes.Calculation.PerUnit;
        return null;
    }

    private static string? ResolveRule(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "SimpleMajority";
        var v = raw.Trim();
        if (ContainsAny(v, "calific") || Eq(v, "QualifiedMajority")) return "QualifiedMajority";
        if (ContainsAny(v, "simple") || Eq(v, "SimpleMajority")) return "SimpleMajority";
        return null;
    }

    private static string? ResolveVisibility(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return ResultVisibility.HiddenUntilClose;
        var v = raw.Trim();
        if (ContainsAny(v, "oculto", "hidden") || Eq(v, ResultVisibility.HiddenUntilClose)) return ResultVisibility.HiddenUntilClose;
        if (ContainsAny(v, "presidente", "president") || Eq(v, ResultVisibility.PresidentOnlyLive)) return ResultVisibility.PresidentOnlyLive;
        if (ContainsAny(v, "vivo", "live") || Eq(v, ResultVisibility.LiveResults)) return ResultVisibility.LiveResults;
        return null;
    }

    private static bool? ResolveYesNo(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return false;
        var v = raw.Trim();
        if (Eq(v, "si") || Eq(v, "sí") || Eq(v, "yes") || Eq(v, "true") || Eq(v, "1")) return true;
        if (Eq(v, "no") || Eq(v, "false") || Eq(v, "0")) return false;
        return null;
    }

    private static string ResolveImportState(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return VotingDesignCodes.DesignStatus.Draft;
        if (ContainsAny(raw, "public")) return VotingDesignCodes.DesignStatus.Ready;
        return VotingDesignCodes.DesignStatus.Draft;
    }

    private static bool Eq(string a, string b) => a.Equals(b, StringComparison.OrdinalIgnoreCase);
    private static bool ContainsAny(string hay, params string[] needles) =>
        needles.Any(n => hay.Contains(n, StringComparison.OrdinalIgnoreCase));

    private static IReadOnlyList<MotionImportCatalogValueDto> BallotCatalog() =>
    [
        new(VotingDesignCodes.Ballot.FavorAgainstAbstain, "A favor / En contra / Abstencion"),
        new(VotingDesignCodes.Ballot.YesNo, "Si / No"),
        new(VotingDesignCodes.Ballot.YesNoAbstain, "Si / No / Abstencion"),
        new(VotingDesignCodes.Ballot.SingleChoice, "Opcion unica"),
        new(VotingDesignCodes.Ballot.MultiCandidate, "Multi-candidato")
    ];

    private static IReadOnlyList<MotionImportCatalogValueDto> MethodCatalog() =>
    [
        new(VotingDesignCodes.Calculation.Coefficient, "Por coeficiente"),
        new(VotingDesignCodes.Calculation.PerPerson, "Por persona"),
        new(VotingDesignCodes.Calculation.PerUnit, "Por unidad")
    ];

    private static IReadOnlyList<MotionImportCatalogValueDto> RuleCatalog() =>
    [
        new("SimpleMajority", "Mayoria simple"),
        new("QualifiedMajority", "Mayoria calificada")
    ];

    private static IReadOnlyList<MotionImportCatalogValueDto> VisibilityCatalog() =>
    [
        new(ResultVisibility.HiddenUntilClose, "Oculto hasta cierre"),
        new(ResultVisibility.PresidentOnlyLive, "Solo mesa en vivo"),
        new(ResultVisibility.LiveResults, "Resultados en vivo")
    ];

    private static string SanitizeFileName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "import.xlsx";
        var leaf = Path.GetFileName(name);
        foreach (var c in Path.GetInvalidFileNameChars()) leaf = leaf.Replace(c, '_');
        return leaf.Length > 120 ? leaf[..120] : leaf;
    }

    private static string ComputeHash(IReadOnlyList<string> headers, IReadOnlyList<string[]> rows)
    {
        using var sha = SHA256.Create();
        var sb = new StringBuilder();
        sb.AppendJoin('|', headers);
        foreach (var r in rows) { sb.Append('\n'); sb.AppendJoin('|', r); }
        var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexString(bytes);
    }

    private static void SweepExpired()
    {
        foreach (var kv in Sessions)
        {
            if (kv.Value.ExpiresAtUtc < DateTimeOffset.UtcNow)
                Sessions.TryRemove(kv.Key, out _);
        }
    }

    private static List<string[]> ParseCsv(string content)
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
        return rows;
    }

    private static string[] SplitCsvLine(string line, char delimiter)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; }
                else inQuotes = !inQuotes;
            }
            else if (c == delimiter && !inQuotes)
            {
                result.Add(sb.ToString());
                sb.Clear();
            }
            else sb.Append(c);
        }
        result.Add(sb.ToString());
        return result.ToArray();
    }

    private sealed class ImportSession
    {
        public Guid SessionId { get; init; }
        public Guid AssemblyId { get; init; }
        public Guid TenantId { get; init; }
        public DateTimeOffset CreatedAtUtc { get; init; }
        public DateTimeOffset ExpiresAtUtc => CreatedAtUtc.Add(SessionLifetime);
        public string SourceKind { get; init; } = "xlsx";
        public string SafeFileName { get; init; } = "import.xlsx";
        public string FileHash { get; init; } = "";
        public List<ImportRow> Rows { get; } = [];
    }

    private sealed class ImportRow
    {
        public int RowNumber { get; init; }
        public bool Included { get; set; } = true;
        public int? Orden { get; set; }
        public string? PuntoAgenda { get; set; }
        public string? PuntoAgendaCode { get; set; }
        public Guid? AgendaItemId { get; set; }
        public string? Codigo { get; set; }
        public bool CodigoGenerated { get; set; }
        public string? TituloCorto { get; set; }
        public string? Pregunta { get; set; }
        public string? Instrucciones { get; set; }
        public string? TipoRespuesta { get; set; }
        public string? Opcion1 { get; set; }
        public string? Opcion2 { get; set; }
        public string? Opcion3 { get; set; }
        public string? Opcion4 { get; set; }
        public string? Opcion5 { get; set; }
        public string? Metodo { get; set; }
        public string? Mayoria { get; set; }
        public decimal? UmbralPorcentaje { get; set; }
        public string? VisibilidadResultado { get; set; }
        public string? VotoSecreto { get; set; }
        public string? EstadoImportacion { get; set; }
        public string Status { get; set; } = "Ready";
        public IReadOnlyList<string> Messages { get; set; } = [];
        public string? BallotKindResolved { get; set; }
        public string? MethodResolved { get; set; }
        public string? RuleResolved { get; set; }
        public string? VisibilityResolved { get; set; }
        public bool IsSecretResolved { get; set; }
        public string EstadoImportacionResolved { get; set; } = VotingDesignCodes.DesignStatus.Draft;
        public List<string> OptionsResolved { get; set; } = [];
    }
}