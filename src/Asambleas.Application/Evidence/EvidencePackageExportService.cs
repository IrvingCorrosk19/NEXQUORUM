namespace Asambleas.Application.Evidence;

using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Documents;
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

    public sealed record DocumentFile(string FileName, string ContentType, byte[] Bytes);

    /// <summary>
    /// Builds a ZIP expediente of premium PDF/TXT reports. Never embeds video recordings.
    /// Integrity note: sealed minutes ContentHash hashes verified JSON facts (not PDF bytes).
    /// Manifest.json stores SHA-256 of each exported file bytes.
    /// </summary>
    public async Task<(MemoryStream Stream, string FileName)> BuildZipAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        EnsureCanDownload();
        var files = await BuildAllFilesAsync(assemblyId, cancellationToken);

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
            metadata: new { fileCount = files.Count, bytes = zipStream.Length, format = "premium-v1" },
            cancellationToken: cancellationToken);

        var fileName = $"expediente-{assemblyId:N}-{DateTime.UtcNow:yyyyMMddHHmmss}.zip";
        return (zipStream, fileName);
    }

    /// <summary>Single document download / inline preview.</summary>
    public async Task<DocumentFile> BuildDocumentAsync(
        Guid assemblyId,
        string documentKey,
        string format,
        CancellationToken cancellationToken = default)
    {
        EnsureCanDownload();
        var key = (documentKey ?? "").Trim().ToLowerInvariant();
        var fmt = (format ?? "pdf").Trim().ToLowerInvariant();
        if (fmt is not ("pdf" or "txt"))
            throw new DomainException("FORMAT_UNSUPPORTED", "Use format=pdf or format=txt.");

        var bundle = await LoadBundleAsync(assemblyId, cancellationToken);
        var ctx = bundle.Context;

        return (key, fmt) switch
        {
            ("acta", "pdf") => new DocumentFile("01-Acta.pdf", "application/pdf", PremiumPdfDocuments.Acta(bundle.Minutes, ctx)),
            ("acta", "txt") => new DocumentFile("01-Acta.txt", "text/plain; charset=utf-8", PremiumTextDocuments.Acta(bundle.Minutes, ctx)),
            ("asistencia", "pdf") => new DocumentFile("02-Asistencia.pdf", "application/pdf", PremiumPdfDocuments.Attendance(bundle.Package, ctx)),
            ("asistencia", "txt") => new DocumentFile("02-Asistencia.txt", "text/plain; charset=utf-8", PremiumTextDocuments.Attendance(bundle.Package, ctx)),
            ("quorum", "pdf") => new DocumentFile("03-Quorum.pdf", "application/pdf", PremiumPdfDocuments.Quorum(bundle.Package, ctx)),
            ("quorum", "txt") => new DocumentFile("03-Quorum.txt", "text/plain; charset=utf-8", PremiumTextDocuments.Quorum(bundle.Package, ctx)),
            ("votaciones", "pdf") => new DocumentFile("04-Votaciones.pdf", "application/pdf", PremiumPdfDocuments.Voting(bundle.Package, ctx)),
            ("votaciones", "txt") => new DocumentFile("04-Votaciones.txt", "text/plain; charset=utf-8", PremiumTextDocuments.Voting(bundle.Package, ctx)),
            ("decisiones", "pdf") => new DocumentFile("05-Decisiones.pdf", "application/pdf", PremiumPdfDocuments.Decisions(bundle.Package, ctx)),
            ("decisiones", "txt") => new DocumentFile("05-Decisiones.txt", "text/plain; charset=utf-8", PremiumTextDocuments.Decisions(bundle.Package, ctx)),
            ("integridad", "pdf") => new DocumentFile("06-Integridad.pdf", "application/pdf", PremiumPdfDocuments.Integrity(bundle.Package, ctx, bundle.RecordingCount)),
            ("integridad", "txt") => new DocumentFile(
                "06-Evidencias/integridad-resumen.txt",
                "text/plain; charset=utf-8",
                PremiumTextDocuments.IntegritySummary(bundle.Package, ctx, bundle.RecordingCount)),
            ("auditoria", "txt") => new DocumentFile(
                "06-Evidencias/auditoria-tecnica.txt",
                "text/plain; charset=utf-8",
                PremiumTextDocuments.TechnicalAudit(bundle.Package, ctx)),
            _ => throw new DomainException(
                "DOCUMENT_UNKNOWN",
                "Documento no reconocido. Use acta|asistencia|quorum|votaciones|decisiones|integridad|auditoria.")
        };
    }

    private async Task<Dictionary<string, byte[]>> BuildAllFilesAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        var bundle = await LoadBundleAsync(assemblyId, cancellationToken);
        var ctx = bundle.Context;
        var package = bundle.Package;
        var minutes = bundle.Minutes;

        var files = new Dictionary<string, byte[]>(StringComparer.Ordinal)
        {
            ["01-Acta.pdf"] = PremiumPdfDocuments.Acta(minutes, ctx),
            ["01-Acta.txt"] = PremiumTextDocuments.Acta(minutes, ctx),
            ["02-Asistencia.pdf"] = PremiumPdfDocuments.Attendance(package, ctx),
            ["02-Asistencia.txt"] = PremiumTextDocuments.Attendance(package, ctx),
            ["03-Quorum.pdf"] = PremiumPdfDocuments.Quorum(package, ctx),
            ["03-Quorum.txt"] = PremiumTextDocuments.Quorum(package, ctx),
            ["04-Votaciones.pdf"] = PremiumPdfDocuments.Voting(package, ctx),
            ["04-Votaciones.txt"] = PremiumTextDocuments.Voting(package, ctx),
            ["05-Decisiones.pdf"] = PremiumPdfDocuments.Decisions(package, ctx),
            ["05-Decisiones.txt"] = PremiumTextDocuments.Decisions(package, ctx),
            ["06-Integridad.pdf"] = PremiumPdfDocuments.Integrity(package, ctx, bundle.RecordingCount),
            ["06-Evidencias/integridad-resumen.txt"] =
                PremiumTextDocuments.IntegritySummary(package, ctx, bundle.RecordingCount),
            ["06-Evidencias/auditoria-tecnica.txt"] = PremiumTextDocuments.TechnicalAudit(package, ctx)
        };

        // Keep legacy path for tooling that still looks for audit-summary.txt (points to integrity summary).
        files["06-Evidencias/audit-summary.txt"] = files["06-Evidencias/integridad-resumen.txt"];

        var manifestEntries = new List<object>();
        foreach (var (path, bytes) in files.OrderBy(kv => kv.Key, StringComparer.Ordinal))
        {
            manifestEntries.Add(new
            {
                path,
                sizeBytes = bytes.Length,
                sha256 = Convert.ToHexString(SHA256.HashData(bytes))
            });
        }

        var manifest = new
        {
            assemblyId,
            title = package.Title,
            propertyHorizontalName = package.PropertyHorizontalName,
            generatedAtUtc = DateTimeOffset.UtcNow,
            documentSystem = "asambleas-premium-v1",
            integrity = new
            {
                minutesDocumentId = minutes.DocumentId,
                minutesContentHash = minutes.ContentHash,
                minutesHashScope =
                    "SHA-256 of verified JSON facts (attendance, quorum, agenda, closed voting, decisions). Not PDF bytes.",
                packageFileHashes = "Each ZIP entry SHA-256 is listed below."
            },
            note = "Expediente documental — las grabaciones de video NO se incluyen en este ZIP.",
            files = manifestEntries
        };
        files["Manifest.json"] = DocumentDesign.Utf8Text(JsonSerializer.Serialize(manifest, ManifestJson));
        return files;
    }

    private sealed record Bundle(
        AssemblyEvidencePackageDto Package,
        AssemblyMinutesDocumentDto Minutes,
        DocumentExportContext Context,
        int RecordingCount);

    private async Task<Bundle> LoadBundleAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var package = await _evidence.GetEvidencePackageAsync(assemblyId, cancellationToken);
        var minutes = await _evidence.GetMinutesDocumentAsync(assemblyId, cancellationToken);
        var recordingCount = await _db.AssemblyRecordings
            .AsNoTracking()
            .CountAsync(r => r.AssemblyId == assemblyId, cancellationToken);

        var ctx = new DocumentExportContext(
            package.AssemblyId,
            package.Title,
            package.PropertyHorizontalName,
            package.Status,
            package.Modality,
            package.ScheduledAtUtc,
            package.GeneratedAtUtc,
            minutes.DocumentId,
            minutes.ContentHash,
            minutes.IsSealed);

        return new Bundle(package, minutes, ctx, recordingCount);
    }

    private void EnsureCanDownload()
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        if (!HasPermission(Permissions.ExpedienteDownload) && !HasPermission(Permissions.ExpedienteView))
        {
            throw new DomainException($"Missing permission '{Permissions.ExpedienteDownload}'.");
        }
    }

    private bool HasPermission(string permission) =>
        _currentTenant.Permissions.Contains(permission, StringComparer.Ordinal)
        || RolePermissionMap.HasPermission(_currentTenant.Roles, permission);
}
