namespace Asambleas.Application.Evidence;

using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Evidence;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class EvidencePackageExportService
{
    private static readonly JsonSerializerOptions ManifestJson = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly AssemblyEvidenceService _evidence;

    public EvidencePackageExportService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        AssemblyEvidenceService evidence)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _evidence = evidence;
    }

    /// <summary>
    /// Builds a ZIP expediente of text/PDF reports only. Never embeds video recordings.
    /// </summary>
    public async Task<(MemoryStream Stream, string FileName)> BuildZipAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        if (!HasPermission(Permissions.ExpedienteDownload) && !HasPermission(Permissions.ExpedienteView))
        {
            throw new DomainException($"Missing permission '{Permissions.ExpedienteDownload}'.");
        }

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var package = await _evidence.GetEvidencePackageAsync(assemblyId, cancellationToken);
        var minutes = await _evidence.GetMinutesDocumentAsync(assemblyId, cancellationToken);

        var files = new Dictionary<string, byte[]>(StringComparer.Ordinal);

        var actaLines = BuildActaLines(minutes);
        files["01-Acta.txt"] = Encoding.UTF8.GetBytes(string.Join(Environment.NewLine, actaLines));
        files["01-Acta.pdf"] = SimplePdf.WriteTextDocument($"Acta — {minutes.Title}", actaLines);

        files["02-Asistencia.txt"] = Encoding.UTF8.GetBytes(BuildAttendanceText(package));
        files["03-Quorum.txt"] = Encoding.UTF8.GetBytes(BuildQuorumText(package));
        files["04-Votaciones.txt"] = Encoding.UTF8.GetBytes(await BuildVotingTextAsync(assemblyId, package, cancellationToken));
        files["05-Decisiones.txt"] = Encoding.UTF8.GetBytes(BuildDecisionsText(package));
        files["06-Evidencias/audit-summary.txt"] = Encoding.UTF8.GetBytes(BuildAuditSummary(package));

        var manifestEntries = new List<object>();
        foreach (var (path, bytes) in files.OrderBy(kv => kv.Key, StringComparer.Ordinal))
        {
            var sha = Convert.ToHexString(SHA256.HashData(bytes));
            manifestEntries.Add(new
            {
                path,
                sizeBytes = bytes.Length,
                sha256 = sha
            });
        }

        var manifest = new
        {
            assemblyId,
            title = package.Title,
            generatedAtUtc = DateTimeOffset.UtcNow,
            note = "Expediente documental — las grabaciones de video NO se incluyen en este ZIP.",
            files = manifestEntries
        };
        files["Manifest.json"] = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(manifest, ManifestJson));

        var zipStream = new MemoryStream();
        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (path, bytes) in files)
            {
                var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
                await using var entryStream = entry.Open();
                await entryStream.WriteAsync(bytes, cancellationToken);
            }
        }

        zipStream.Position = 0;

        await _audit.WriteAsync(
            AuditEventType.EvidencePackageGenerated,
            assemblyId,
            metadata: new { fileCount = files.Count, bytes = zipStream.Length },
            cancellationToken: cancellationToken);

        var fileName = $"expediente-{assemblyId:N}-{DateTime.UtcNow:yyyyMMddHHmmss}.zip";
        return (zipStream, fileName);
    }

    private async Task<string> BuildVotingTextAsync(
        Guid assemblyId,
        AssemblyEvidencePackageDto package,
        CancellationToken cancellationToken)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Votaciones — {package.Title}");
        sb.AppendLine($"Generado: {DateTimeOffset.UtcNow:O}");
        sb.AppendLine();

        foreach (var entry in package.Voting)
        {
            var session = entry.ClosedSession;
            var results = entry.Results;
            sb.AppendLine($"Moción: {entry.Motion.Code} — {entry.Motion.Title}");
            if (session is null)
            {
                sb.AppendLine("  (sin sesión de votación)");
                sb.AppendLine();
                continue;
            }

            sb.AppendLine($"  Sesión: {session.Id}");
            sb.AppendLine($"  Estado: {session.Status}");
            sb.AppendLine($"  Regla: {session.AppliedDecisionRule ?? results?.AppliedDecisionRule ?? "—"}");
            sb.AppendLine($"  Visibilidad: {session.ResultVisibilityPolicy}");
            sb.AppendLine($"  Secreta/HidePartial: {session.HidePartialResults}");

            if (results is not null)
            {
                sb.AppendLine(
                    $"  Totales: a favor {results.InFavorCoefficient:0.####}% ({results.InFavorVotes}) | " +
                    $"en contra {results.AgainstCoefficient:0.####}% ({results.AgainstVotes}) | " +
                    $"abstención {results.AbstentionCoefficient:0.####}% ({results.AbstentionVotes}) | " +
                    $"emitidos {results.VotesCast}");
            }

            // Never export owner→choice for secret / hide-partial ballots.
            if (session.HidePartialResults)
            {
                sb.AppendLine("  Detalle individual: OMITIDO (voto secreto / HidePartialResults).");
            }
            else
            {
                var votes = await _db.Votes
                    .AsNoTracking()
                    .Where(v => v.VotingSessionId == session.Id && v.AssemblyId == assemblyId)
                    .OrderBy(v => v.CastAtUtc)
                    .ToListAsync(cancellationToken);

                if (votes.Count == 0)
                {
                    sb.AppendLine("  Sin votos individuales registrados.");
                }
                else
                {
                    var names = package.Attendance.ToDictionary(p => p.UserId, p => p.DisplayName);
                    foreach (var vote in votes)
                    {
                        var name = names.GetValueOrDefault(vote.UserId, vote.UserId.ToString("N"));
                        sb.AppendLine(
                            $"  - {name}: {vote.Choice} ({vote.CoefficientPercent:0.####}%) @ {vote.CastAtUtc:O}");
                    }
                }
            }

            sb.AppendLine();
        }

        return sb.ToString();
    }

    private static IReadOnlyList<string> BuildActaLines(AssemblyMinutesDocumentDto minutes)
    {
        var lines = new List<string>
        {
            $"Documento: {minutes.DocumentId}",
            $"Asamblea: {minutes.Title}",
            $"PH: {minutes.PropertyHorizontalName}",
            $"Estado: {minutes.Status} | Modalidad: {minutes.Modality}",
            $"Programada: {minutes.ScheduledAtUtc:O}",
            $"Generado: {minutes.GeneratedAtUtc:O}",
            $"Hash: {minutes.ContentHash}",
            string.Empty,
            "Asistentes acreditados:"
        };

        foreach (var p in minutes.Attendance)
        {
            lines.Add($"  - {p.DisplayName} ({p.RoleCode}) coef={p.EffectiveCoefficientPercent:0.####}%");
        }

        lines.Add(string.Empty);
        lines.Add("Agenda:");
        foreach (var a in minutes.Agenda)
        {
            lines.Add($"  - [{a.Code}] {a.Title}");
        }

        lines.Add(string.Empty);
        lines.Add("Decisiones:");
        foreach (var d in minutes.Decisions)
        {
            lines.Add($"  - {d.DecisionNumber}: {d.MotionTitle} → {d.DecisionStatus}");
            lines.Add($"    {d.Explanation}");
        }

        lines.Add(string.Empty);
        lines.Add(minutes.Disclaimer);
        return lines;
    }

    private static string BuildAttendanceText(AssemblyEvidencePackageDto package)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Asistencia — {package.Title}");
        sb.AppendLine($"Generado: {package.GeneratedAtUtc:O}");
        sb.AppendLine();
        foreach (var p in package.Attendance.OrderBy(x => x.DisplayName))
        {
            sb.AppendLine(
                $"{p.DisplayName}\t{p.RoleCode}\t{p.AttendanceStatus}\taccredited={p.IsAccredited}\tcoef={p.EffectiveCoefficientPercent:0.####}%\tunit={p.UnitCode ?? "—"}");
        }

        sb.AppendLine();
        sb.AppendLine("Representaciones activas:");
        foreach (var r in package.Representations.Where(x => x.IsActive))
        {
            sb.AppendLine(
                $"  unidad {r.UnitCode} → {r.RepresentativeDisplayName} ({r.Source}) coef={r.CoefficientSnapshot:0.####}%");
        }

        return sb.ToString();
    }

    private static string BuildQuorumText(AssemblyEvidencePackageDto package)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Quórum — {package.Title}");
        sb.AppendLine($"Generado: {package.GeneratedAtUtc:O}");
        sb.AppendLine();
        if (package.LatestQuorum is not null)
        {
            var q = package.LatestQuorum;
            sb.AppendLine(
                $"Último: reached={q.QuorumReached} present={q.CurrentCoefficient:0.####}% required={q.RequiredCoefficient:0.####}% ({q.RequiredPercent:0.####}%)");
        }

        sb.AppendLine();
        sb.AppendLine("Snapshots:");
        foreach (var s in package.QuorumSnapshots)
        {
            sb.AppendLine(
                $"  {s.TimestampUtc:O}\t{s.Status}\tpresent={s.PresentCoefficient:0.####}%\trequired={s.RequiredCoefficient:0.####}%\t{s.Reason}");
        }

        return sb.ToString();
    }

    private static string BuildDecisionsText(AssemblyEvidencePackageDto package)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Decisiones — {package.Title}");
        sb.AppendLine($"Generado: {package.GeneratedAtUtc:O}");
        sb.AppendLine();
        if (package.Decisions.Count == 0)
        {
            sb.AppendLine("(sin decisiones cerradas)");
            return sb.ToString();
        }

        foreach (var d in package.Decisions)
        {
            sb.AppendLine($"{d.DecisionNumber}");
            sb.AppendLine($"  Moción: {d.MotionCode} — {d.MotionTitle}");
            sb.AppendLine($"  Estado: {d.DecisionStatus} | Regla: {d.AppliedDecisionRule}");
            sb.AppendLine(
                $"  Coef: a favor {d.InFavorCoefficient:0.####}% / en contra {d.AgainstCoefficient:0.####}% / abstención {d.AbstentionCoefficient:0.####}%");
            sb.AppendLine($"  Votos: {d.VotesCast} | Secreta: {d.SecretBallot} | Cierre: {d.DecidedAtUtc:O}");
            sb.AppendLine($"  {d.Explanation}");
            sb.AppendLine();
        }

        return sb.ToString();
    }

    private static string BuildAuditSummary(AssemblyEvidencePackageDto package)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Resumen de evidencias / auditoría — {package.Title}");
        sb.AppendLine($"Completitud: {package.Completeness.Status}");
        foreach (var note in package.Completeness.Notes)
        {
            sb.AppendLine($"  - {note}");
        }

        sb.AppendLine();
        sb.AppendLine("Eventos (máx. listados en paquete):");
        foreach (var e in package.Timeline)
        {
            sb.AppendLine($"{e.OccurredAtUtc:O}\t{e.EventType}\tuser={e.UserId}");
        }

        return sb.ToString();
    }

    private bool HasPermission(string permission) =>
        _currentTenant.Permissions.Contains(permission, StringComparer.Ordinal)
        || RolePermissionMap.HasPermission(_currentTenant.Roles, permission);
}
