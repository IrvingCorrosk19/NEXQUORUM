namespace Asambleas.Application.Documents;

using System.Globalization;
using System.Text;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Evidence;
using Asambleas.Contracts.Quorum;

/// <summary>Human-readable UTF-8 (BOM) text reports for the evidence layer.</summary>
public static class PremiumTextDocuments
{
    private static readonly CultureInfo EsPa = CultureInfo.GetCultureInfo("es-PA");

    public static byte[] Acta(AssemblyMinutesDocumentDto m, DocumentExportContext ctx)
    {
        var sb = new StringBuilder();
        Header(sb, "ACTA DE ASAMBLEA", ctx);
        sb.AppendLine($"Documento: {m.DocumentId}");
        sb.AppendLine($"Estado documental: {ctx.Lifecycle}");
        sb.AppendLine($"Estado asamblea: {DocumentLabels.AssemblyStatus(m.Status)}");
        sb.AppendLine($"Modalidad: {DocumentLabels.Modality(m.Modality)}");
        sb.AppendLine($"Programada: {DocumentDates.Long(m.ScheduledAtUtc)}");
        sb.AppendLine($"Inicio: {DocumentDates.Long(m.AssemblyStartedAtUtc)}");
        sb.AppendLine($"Cierre: {DocumentDates.Long(m.CompletedAtUtc)}");
        sb.AppendLine($"Generado: {DocumentDates.Long(m.GeneratedAtUtc)}");
        sb.AppendLine();

        sb.AppendLine("## 1. INFORMACIÓN DE LA ASAMBLEA");
        sb.AppendLine($"PH: {m.PropertyHorizontalName}");
        sb.AppendLine($"Título: {m.Title}");
        sb.AppendLine();

        sb.AppendLine("## 2. CONSTITUCIÓN / QUÓRUM");
        if (m.Quorum is null)
        {
            sb.AppendLine("Sin registro de quórum al momento de generar este documento.");
        }
        else
        {
            var q = m.Quorum;
            sb.AppendLine($"Quórum requerido: {DocumentLabels.Coefficient(q.RequiredCoefficient)}");
            sb.AppendLine($"Quórum alcanzado (presente): {DocumentLabels.Coefficient(q.CurrentCoefficient)}");
            sb.AppendLine($"Estado: {DocumentLabels.QuorumStatus(null, q.QuorumReached)}");
            sb.AppendLine($"Calculado: {DocumentDates.Long(q.CalculatedAtUtc)}");
        }
        sb.AppendLine();

        sb.AppendLine("## 3. ASISTENCIA (acreditados / presentes)");
        sb.AppendLine($"Total listados: {m.Attendance.Count}");
        foreach (var p in m.Attendance.OrderBy(x => x.DisplayName))
        {
            sb.AppendLine(
                $"  - {p.DisplayName} | Unidad {p.UnitCode ?? "—"} | {DocumentLabels.Role(p.RoleCode)} | " +
                $"{DocumentLabels.AttendanceStatus(p.AttendanceStatus)} | {DocumentLabels.Accreditation(p.IsAccredited)} | " +
                $"{DocumentLabels.Coefficient(p.EffectiveCoefficientPercent)}");
        }
        sb.AppendLine();

        sb.AppendLine("## 4. ORDEN DEL DÍA");
        foreach (var a in m.Agenda.OrderBy(x => x.Ordinal))
        {
            sb.AppendLine($"  {a.Ordinal}. [{a.Code}] {a.Title}");
        }
        if (m.Agenda.Count == 0) sb.AppendLine("  (sin puntos de agenda registrados)");
        sb.AppendLine();

        sb.AppendLine("## 5. VOTACIONES (sesiones cerradas)");
        if (m.Motions.Count == 0)
        {
            sb.AppendLine("No hay votaciones cerradas registradas.");
        }
        else
        {
            foreach (var entry in m.Motions)
            {
                AppendMotionBlock(sb, entry);
            }
        }
        sb.AppendLine();

        sb.AppendLine("## 6. DECISIONES");
        AppendDecisions(sb, m.Decisions, m.Status);
        sb.AppendLine();

        sb.AppendLine("## 7. INTEGRIDAD DOCUMENTAL");
        sb.AppendLine($"Identificador: {m.DocumentId}");
        sb.AppendLine($"Hash SHA-256 (hechos JSON): {m.ContentHash ?? "—"}");
        sb.AppendLine($"Sellado: {(m.IsSealed ? "Sí" : "No")}");
        sb.AppendLine($"Estado: {ctx.Lifecycle}");
        sb.AppendLine();
        sb.AppendLine(m.Disclaimer);
        return DocumentDesign.Utf8Text(sb.ToString());
    }

    public static byte[] Attendance(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        var sb = new StringBuilder();
        Header(sb, "REGISTRO DE ASISTENCIA", ctx);
        var accredited = p.Attendance.Count(x => x.IsAccredited);
        var represented = p.Representations.Count(x => x.IsActive);
        var coef = p.Attendance.Where(x => x.IsAccredited).Sum(x => x.EffectiveCoefficientPercent);
        sb.AppendLine($"Registrados: {p.Attendance.Count}");
        sb.AppendLine($"Acreditados: {accredited}");
        sb.AppendLine($"Representaciones activas: {represented}");
        sb.AppendLine($"Coeficiente acreditado (suma): {DocumentLabels.Coefficient(coef)}");
        sb.AppendLine();
        sb.AppendLine("## PARTICIPANTES");
        sb.AppendLine("Nombre\tUnidad\tCalidad\tEstado\tAcreditación\tCoeficiente");
        foreach (var row in p.Attendance.OrderBy(x => x.DisplayName))
        {
            sb.AppendLine(
                $"{row.DisplayName}\t{row.UnitCode ?? "—"}\t{DocumentLabels.Role(row.RoleCode)}\t" +
                $"{DocumentLabels.AttendanceStatus(row.AttendanceStatus)}\t{DocumentLabels.Accreditation(row.IsAccredited)}\t" +
                $"{DocumentLabels.Coefficient(row.EffectiveCoefficientPercent)}");
        }
        sb.AppendLine();
        sb.AppendLine("## REPRESENTACIONES");
        var reps = p.Representations.Where(x => x.IsActive).ToList();
        if (reps.Count == 0)
        {
            sb.AppendLine("(sin representaciones activas)");
        }
        else
        {
            foreach (var r in reps.OrderBy(x => x.UnitCode))
            {
                sb.AppendLine(
                    $"Unidad {r.UnitCode} → {r.RepresentativeDisplayName} | " +
                    $"{DocumentLabels.RepresentationSource(r.Source)} | {DocumentLabels.Coefficient(r.CoefficientSnapshot)}");
            }
        }
        return DocumentDesign.Utf8Text(sb.ToString());
    }

    public static byte[] Quorum(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        var sb = new StringBuilder();
        Header(sb, "CERTIFICACIÓN DE QUÓRUM", ctx);
        if (p.LatestQuorum is null)
        {
            sb.AppendLine("No hay cálculo de quórum registrado.");
        }
        else
        {
            var q = p.LatestQuorum;
            sb.AppendLine($"Quórum requerido: {DocumentLabels.Coefficient(q.RequiredCoefficient)}");
            sb.AppendLine($"Quórum alcanzado: {DocumentLabels.Coefficient(q.CurrentCoefficient)}");
            sb.AppendLine($"Estado: {DocumentLabels.QuorumStatus(null, q.QuorumReached)}");
            sb.AppendLine($"Momento del cálculo: {DocumentDates.Long(q.CalculatedAtUtc)}");
            sb.AppendLine($"Unidades presentes: {q.PresentUnits} / elegibles: {q.EligibleUnits}");
        }
        sb.AppendLine();
        sb.AppendLine("## EVOLUCIÓN DEL QUÓRUM");
        foreach (var s in CompressSnapshots(p.QuorumSnapshots))
        {
            sb.AppendLine(
                $"{DocumentDates.Long(s.TimestampUtc)}\t{DocumentLabels.QuorumStatus(s.Status)}\t" +
                $"presente {DocumentLabels.Coefficient(s.PresentCoefficient)}\t" +
                $"requerido {DocumentLabels.Coefficient(s.RequiredCoefficient)}" +
                (string.IsNullOrWhiteSpace(s.Reason) ? "" : $"\t{s.Reason}"));
        }
        if (p.QuorumSnapshots.Count == 0) sb.AppendLine("(sin snapshots)");
        sb.AppendLine();
        sb.AppendLine("## TRAZABILIDAD TÉCNICA (snapshots completos)");
        foreach (var s in p.QuorumSnapshots)
        {
            sb.AppendLine(
                $"{DocumentDates.IsoTechnical(s.TimestampUtc)}\t{s.Status}\t" +
                $"present={s.PresentCoefficient.ToString("0.####", CultureInfo.InvariantCulture)}%\t" +
                $"required={s.RequiredCoefficient.ToString("0.####", CultureInfo.InvariantCulture)}%\t{s.Reason}");
        }
        return DocumentDesign.Utf8Text(sb.ToString());
    }

    public static byte[] Voting(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        var sb = new StringBuilder();
        Header(sb, "INFORME DE VOTACIONES", ctx);
        if (p.Voting.Count == 0)
        {
            sb.AppendLine("No hay mociones registradas.");
            return DocumentDesign.Utf8Text(sb.ToString());
        }
        foreach (var entry in p.Voting)
        {
            AppendMotionBlock(sb, entry);
            sb.AppendLine();
        }
        return DocumentDesign.Utf8Text(sb.ToString());
    }

    public static byte[] Decisions(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        var sb = new StringBuilder();
        Header(sb, "REGISTRO DE DECISIONES", ctx);
        AppendDecisions(sb, p.Decisions, p.Status);
        return DocumentDesign.Utf8Text(sb.ToString());
    }

    public static byte[] IntegritySummary(AssemblyEvidencePackageDto p, DocumentExportContext ctx, int recordingCount)
    {
        var sb = new StringBuilder();
        Header(sb, "RESUMEN DE INTEGRIDAD", ctx);
        sb.AppendLine($"Estado asamblea: {DocumentLabels.AssemblyStatus(p.Status)}");
        sb.AppendLine($"Estado documental: {ctx.Lifecycle}");
        sb.AppendLine($"Completitud: {DocumentLabelExtras.Completeness(p.Completeness.Status)}");
        foreach (var note in p.Completeness.Notes)
            sb.AppendLine($"  · {note}");
        sb.AppendLine($"Eventos de auditoría incluidos: {p.Timeline.Count}");
        sb.AppendLine($"Grabaciones (referencia, no en ZIP): {recordingCount}");
        sb.AppendLine("Documentos incluidos en el paquete:");
        sb.AppendLine("  · 01-Acta.pdf / 01-Acta.txt");
        sb.AppendLine("  · 02-Asistencia.pdf / 02-Asistencia.txt");
        sb.AppendLine("  · 03-Quorum.pdf / 03-Quorum.txt");
        sb.AppendLine("  · 04-Votaciones.pdf / 04-Votaciones.txt");
        sb.AppendLine("  · 05-Decisiones.pdf / 05-Decisiones.txt");
        sb.AppendLine("  · 06-Evidencias/integridad-resumen.txt");
        sb.AppendLine("  · 06-Evidencias/auditoria-tecnica.txt");
        sb.AppendLine("  · Manifest.json");
        sb.AppendLine();
        sb.AppendLine("## INTEGRIDAD DEL ACTA (hechos)");
        sb.AppendLine($"Identificador: {ctx.DocumentId}");
        sb.AppendLine($"Hash SHA-256: {ctx.ContentHash ?? "—"}");
        sb.AppendLine("Nota: el hash del acta sella hechos JSON verificados; no hashea bytes del PDF.");
        sb.AppendLine("Cada archivo del ZIP declara su propio SHA-256 en Manifest.json.");
        return DocumentDesign.Utf8Text(sb.ToString());
    }

    public static byte[] TechnicalAudit(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        var sb = new StringBuilder();
        Header(sb, "AUDITORÍA TÉCNICA", ctx);
        sb.AppendLine($"CompletenessStatus={p.Completeness.Status}");
        sb.AppendLine($"HasAttendance={p.Completeness.HasAttendance}");
        sb.AppendLine($"HasQuorum={p.Completeness.HasQuorum}");
        sb.AppendLine($"HasAgenda={p.Completeness.HasAgenda}");
        sb.AppendLine($"HasDecisions={p.Completeness.HasDecisions}");
        sb.AppendLine($"IsClosed={p.Completeness.IsClosed}");
        sb.AppendLine();
        sb.AppendLine("## EVENTOS");
        foreach (var e in p.Timeline)
        {
            sb.AppendLine(
                $"{DocumentDates.IsoTechnical(e.OccurredAtUtc)}\t{e.EventType}\tuser={e.UserId}");
        }
        return DocumentDesign.Utf8Text(sb.ToString());
    }

    private static void Header(StringBuilder sb, string title, DocumentExportContext ctx)
    {
        sb.AppendLine("================================================");
        sb.AppendLine("ASAMBLEAS");
        sb.AppendLine(title);
        sb.AppendLine(ctx.PropertyHorizontalName);
        sb.AppendLine(ctx.AssemblyTitle);
        sb.AppendLine("================================================");
        sb.AppendLine($"Generado: {DocumentDates.Long(ctx.GeneratedAtUtc)}");
        sb.AppendLine($"Estado documental: {ctx.Lifecycle}");
        sb.AppendLine();
    }

    private static void AppendMotionBlock(StringBuilder sb, AssemblyMinutesMotionEntryDto entry)
    {
        var m = entry.Motion;
        sb.AppendLine($"### {m.Code}");
        sb.AppendLine(m.QuestionText ?? m.Title);
        if (!string.IsNullOrWhiteSpace(m.Body) && m.Body != m.Title)
            sb.AppendLine(m.Body);
        sb.AppendLine($"Método: {DocumentLabelExtras.CalculationMethod(m.CalculationMethod)}");
        sb.AppendLine($"Mayoría: {DocumentLabelExtras.DecisionRule(m.DecisionRuleCode)}");
        if (entry.ClosedSession is null)
        {
            sb.AppendLine("Estado: No sometida a votación");
            return;
        }
        var s = entry.ClosedSession;
        sb.AppendLine($"Estado sesión: {DocumentLabels.VotingSessionStatus(s.Status)}");
        sb.AppendLine($"Apertura: {DocumentDates.Long(s.OpenedAtUtc)}");
        sb.AppendLine($"Cierre: {DocumentDates.Long(s.ClosedAtUtc)}");
        if (entry.Results is not null)
        {
            var r = entry.Results;
            sb.AppendLine(
                $"A favor: {r.InFavorVotes} ({DocumentLabels.Coefficient(r.InFavorCoefficient)}) | " +
                $"En contra: {r.AgainstVotes} ({DocumentLabels.Coefficient(r.AgainstCoefficient)}) | " +
                $"Abstención: {r.AbstentionVotes} ({DocumentLabels.Coefficient(r.AbstentionCoefficient)})");
            sb.AppendLine($"Votos emitidos: {r.VotesCast}");
            sb.AppendLine($"Resultado: {DocumentLabels.DecisionStatus(r.DecisionStatus)}");
            if (!string.IsNullOrWhiteSpace(r.DecisionExplanation))
                sb.AppendLine(r.DecisionExplanation);
        }
    }

    private static void AppendDecisions(StringBuilder sb, IReadOnlyList<DecisionDto> decisions, string assemblyStatus)
    {
        if (decisions.Count == 0)
        {
            sb.AppendLine("No existen decisiones formalmente cerradas al momento de generar este documento.");
            var life = DocumentLabels.DocumentLifecycle(assemblyStatus);
            if (life is "DOCUMENTO EN CURSO" or "BORRADOR" or "Pausada")
                sb.AppendLine($"La asamblea figura como: {DocumentLabels.AssemblyStatus(assemblyStatus)}.");
            return;
        }
        foreach (var d in decisions)
        {
            sb.AppendLine($"### {d.DecisionNumber}");
            sb.AppendLine($"Moción: {d.MotionCode} — {d.MotionTitle}");
            sb.AppendLine($"Resultado: {DocumentLabels.DecisionStatus(d.DecisionStatus)}");
            sb.AppendLine($"Regla: {DocumentLabelExtras.DecisionRule(d.AppliedDecisionRule)}");
            sb.AppendLine($"Fecha: {DocumentDates.Long(d.DecidedAtUtc)}");
            sb.AppendLine(
                $"Coeficientes: a favor {DocumentLabels.Coefficient(d.InFavorCoefficient)} / " +
                $"en contra {DocumentLabels.Coefficient(d.AgainstCoefficient)} / " +
                $"abstención {DocumentLabels.Coefficient(d.AbstentionCoefficient)}");
            sb.AppendLine($"Votos: {d.VotesCast} | Secreta: {DocumentLabels.YesNo(d.SecretBallot)}");
            if (!string.IsNullOrWhiteSpace(d.Explanation))
                sb.AppendLine(d.Explanation);
            sb.AppendLine();
        }
    }

    /// <summary>Collapse consecutive identical quorum rows for the human layer.</summary>
    public static IReadOnlyList<QuorumSnapshotDto> CompressSnapshots(IReadOnlyList<QuorumSnapshotDto> snapshots)
    {
        if (snapshots.Count == 0) return snapshots;
        var ordered = snapshots.OrderBy(s => s.TimestampUtc).ToList();
        var result = new List<QuorumSnapshotDto> { ordered[0] };
        for (var i = 1; i < ordered.Count; i++)
        {
            var prev = result[^1];
            var cur = ordered[i];
            var same =
                prev.Status == cur.Status
                && prev.PresentCoefficient == cur.PresentCoefficient
                && prev.RequiredCoefficient == cur.RequiredCoefficient
                && prev.PresentUnits == cur.PresentUnits;
            if (!same) result.Add(cur);
        }
        // Always keep last
        if (result[^1].Id != ordered[^1].Id)
            result.Add(ordered[^1]);
        return result;
    }
}
