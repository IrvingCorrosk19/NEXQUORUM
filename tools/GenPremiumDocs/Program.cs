using System.Text;
using Asambleas.Application.Documents;
using Asambleas.Contracts.Agenda;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Audit;
using Asambleas.Contracts.Evidence;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Quorum;
using Asambleas.Contracts.Speakers;
using Asambleas.Contracts.Voting;

var outDir = args.Length > 0 ? args[0] : Path.GetFullPath(Path.Combine("artifacts", "doc-qa"));
Directory.CreateDirectory(outDir);

var assemblyId = Guid.Parse("44444444-4444-4444-4444-444444444401");
var now = DateTimeOffset.Parse("2026-08-16T03:53:40.8702807+00:00");

var attendance = new List<AssemblyParticipantDto>
{
    new(Guid.NewGuid(), assemblyId, Guid.NewGuid(), Guid.NewGuid(), "101", 14m, "José Núñez", "Owner", "CheckedIn", now, true, 14m, now, 0, null),
    new(Guid.NewGuid(), assemblyId, Guid.NewGuid(), Guid.NewGuid(), "202", 8.5m, "María Gómez", "Owner", "Present", now, true, 8.5m, now, 0, null),
    new(Guid.NewGuid(), assemblyId, Guid.NewGuid(), Guid.NewGuid(), "303", 5m, "Área común Admin", "PHAdmin", "TemporarilyDisconnected", now, true, 5m, now, 1, null),
};

var agenda = new List<AgendaItemDto>
{
    new(Guid.NewGuid(), assemblyId, 1, "A01", "Verificación de quórum e instalación", true),
    new(Guid.NewGuid(), assemblyId, 2, "A02", "Lectura y aprobación del orden del día", false),
    new(Guid.NewGuid(), assemblyId, 3, "A03", "Aprobación del presupuesto", false),
    new(Guid.NewGuid(), assemblyId, 4, "A04", "Proposición extraordinaria", false),
};

var motion = new MotionDto(
    Guid.NewGuid(), assemblyId, agenda[2].Id, "MOTION-001",
    "Aprobación del presupuesto de gastos comunes 2026",
    "¿Se aprueba el presupuesto?",
    "Ready", CalculationMethod: "Coefficient", DecisionRuleCode: "SimpleMajority",
    QuestionText: "¿Se aprueba el presupuesto de gastos comunes 2026?");

var motionOpen = new MotionDto(
    Guid.NewGuid(), assemblyId, agenda[3].Id, "MOTION-002",
    "Proposición extraordinaria",
    "Texto",
    "Draft", CalculationMethod: "Coefficient", DecisionRuleCode: "SimpleMajority",
    QuestionText: "Proposición extraordinaria sobre área común");

var session = new VotingSessionDto(
    Guid.NewGuid(), assemblyId, motion.Id, "Closed", now.AddHours(-2), now.AddHours(-1),
    true, "SimpleMajority", "Approved", CalculationMethod: "Coefficient");

var results = new VotingResultsDto(
    session.Id, motion.Id, 62.5m, 20m, 10m, 12, "Approved",
    8, 3, 1, "SimpleMajority", "Aprobada por mayoría simple");

var decisions = new List<DecisionDto>
{
    new("DEC-001", assemblyId, motion.Id, "MOTION-001", motion.Title, agenda[2].Id,
        "Approved", "SimpleMajority", 62.5m, 20m, 10m, 12, now.AddHours(-1), session.Id, true,
        "Decisión registrada a partir de la sesión de votación cerrada.")
};

var snapshots = new List<QuorumSnapshotDto>();
for (var i = 0; i < 40; i++)
{
    snapshots.Add(new QuorumSnapshotDto(
        Guid.NewGuid(), assemblyId, now.AddMinutes(-40 + i), 9, 45m, 50m, "NotReached", null, 12));
}
snapshots.Add(new QuorumSnapshotDto(Guid.NewGuid(), assemblyId, now.AddMinutes(-5), 11, 92m, 50m, "Reached", null, 12));
for (var i = 0; i < 10; i++)
{
    snapshots.Add(new QuorumSnapshotDto(
        Guid.NewGuid(), assemblyId, now.AddMinutes(-4).AddSeconds(i), 11, 92m, 50m, "Reached", null, 12));
}

var latestQuorum = new QuorumDto(assemblyId, 92m, 50m, 50m, true, 11, 12, now);

var package = new AssemblyEvidencePackageDto(
    assemblyId,
    "Asamblea General Ordinaria 2026",
    "PH Ocean Tower QA",
    "Paused",
    "Virtual",
    now.AddDays(-1),
    now,
    new EvidenceCompletenessDto("Partial", new[] { "Asamblea aún no finalizada." }, true, true, true, true, false),
    attendance,
    new List<RepresentationEvidenceDto>
    {
        new(Guid.NewGuid(), "404", 3.25m, attendance[0].UserId, "José Núñez", "Power", Guid.NewGuid(), true)
    },
    snapshots,
    latestQuorum,
    agenda,
    Array.Empty<SpeakerRequestDto>(),
    new[] { motion, motionOpen },
    new[]
    {
        new AssemblyMinutesMotionEntryDto(motion, session, results),
        new AssemblyMinutesMotionEntryDto(motionOpen, null, null)
    },
    decisions,
    new[]
    {
        new AuditEventDto(Guid.NewGuid(), Guid.NewGuid(), null, null, assemblyId, null, "AssemblyStarted", Guid.NewGuid(), now.AddHours(-3), "{}")
    });

var minutes = new AssemblyMinutesDocumentDto(
    assemblyId,
    package.Title,
    package.PropertyHorizontalName,
    package.Status,
    package.Modality,
    package.ScheduledAtUtc,
    package.GeneratedAtUtc,
    $"ACTA-{assemblyId:N}-20260816035340",
    "CB1BD5F8DEADBEEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
    package.Completeness,
    now.AddHours(-3),
    now.AddHours(-2),
    null,
    latestQuorum,
    attendance,
    package.Representations,
    agenda,
    Array.Empty<SpeakerRequestDto>(),
    new[] { new AssemblyMinutesMotionEntryDto(motion, session, results) },
    decisions,
    "Este documento resume hechos verificados por el sistema. No constituye por sí solo validación jurídica externa.",
    false);

var ctx = new DocumentExportContext(
    assemblyId, package.Title, package.PropertyHorizontalName, package.Status, package.Modality,
    package.ScheduledAtUtc, package.GeneratedAtUtc, minutes.DocumentId, minutes.ContentHash, false);

void Write(string name, byte[] bytes) => File.WriteAllBytes(Path.Combine(outDir, name), bytes);

Write("01-Acta.pdf", PremiumPdfDocuments.Acta(minutes, ctx));
Write("01-Acta.txt", PremiumTextDocuments.Acta(minutes, ctx));
Write("02-Asistencia.pdf", PremiumPdfDocuments.Attendance(package, ctx));
Write("02-Asistencia.txt", PremiumTextDocuments.Attendance(package, ctx));
Write("03-Quorum.pdf", PremiumPdfDocuments.Quorum(package, ctx));
Write("03-Quorum.txt", PremiumTextDocuments.Quorum(package, ctx));
Write("04-Votaciones.pdf", PremiumPdfDocuments.Voting(package, ctx));
Write("04-Votaciones.txt", PremiumTextDocuments.Voting(package, ctx));
Write("05-Decisiones.pdf", PremiumPdfDocuments.Decisions(package, ctx));
Write("05-Decisiones.txt", PremiumTextDocuments.Decisions(package, ctx));
Write("06-Integridad.pdf", PremiumPdfDocuments.Integrity(package, ctx, 1));
Write("integridad-resumen.txt", PremiumTextDocuments.IntegritySummary(package, ctx, 1));
Write("auditoria-tecnica.txt", PremiumTextDocuments.TechnicalAudit(package, ctx));

var longAttendance = Enumerable.Range(1, 300).Select(i =>
    new AssemblyParticipantDto(
        Guid.NewGuid(), assemblyId, Guid.NewGuid(), Guid.NewGuid(),
        $"{100 + i}", Math.Round(100m / 300m, 4),
        $"Propietario {i:000} Núñez", "Owner", "CheckedIn", now, true, Math.Round(100m / 300m, 4), now, 0, null)
).ToList();
Write("02-Asistencia-300.pdf", PremiumPdfDocuments.Attendance(package with { Attendance = longAttendance }, ctx));

var txtBytes = File.ReadAllBytes(Path.Combine(outDir, "01-Acta.txt"));
if (txtBytes.Length < 3 || txtBytes[0] != 0xEF || txtBytes[1] != 0xBB || txtBytes[2] != 0xBF)
    throw new Exception("TXT missing UTF-8 BOM");

var txt = Encoding.UTF8.GetString(txtBytes);
foreach (var c in new[]
         {
             "Verificación de quórum", "José Núñez", "María Gómez", "orden del día",
             "DOCUMENTO EN CURSO", "Propietario", "Acreditado", "14.00 %"
         })
{
    if (!txt.Contains(c, StringComparison.Ordinal))
        throw new Exception($"UTF-8/content FAIL missing: {c}");
}

if (txt.Contains("Verificaci??n", StringComparison.Ordinal)
    || txt.Contains("VerificaciÃ³n", StringComparison.Ordinal)
    || txt.Contains("accredited=True", StringComparison.Ordinal)
    || txt.Contains("CheckedIn", StringComparison.Ordinal))
{
    throw new Exception("Encoding/presentation FAIL");
}

// Extract text-ish strings from PDF binary for Spanish glyphs
var pdf = File.ReadAllBytes(Path.Combine(outDir, "01-Acta.pdf"));
var pdfAscii = Encoding.Latin1.GetString(pdf);
if (pdfAscii.Contains("Verificaci??n", StringComparison.Ordinal))
    throw new Exception("PDF still contains ?? mojibake markers");

Console.WriteLine($"OK → {outDir}");
foreach (var f in Directory.GetFiles(outDir).OrderBy(x => x))
    Console.WriteLine($"  {Path.GetFileName(f),-28} {new FileInfo(f).Length,8} bytes");
