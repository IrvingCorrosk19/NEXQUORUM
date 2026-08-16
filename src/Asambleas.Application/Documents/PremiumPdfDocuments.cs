namespace Asambleas.Application.Documents;

using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Evidence;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

/// <summary>Premium A4 PDF builders for the ASAMBLEAS Document & Evidence System.</summary>
public static class PremiumPdfDocuments
{
    public static byte[] Acta(AssemblyMinutesDocumentDto m, DocumentExportContext ctx)
    {
        DocumentDesign.EnsureLicense();
        return Document.Create(container =>
        {
            // Cover
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(56);
                page.DefaultTextStyle(x => x.FontSize(11).FontColor(DocumentDesign.Ink));
                if (ctx.ShowDraftWatermark)
                {
                    page.Foreground().AlignCenter().AlignMiddle()
                        .Text(ctx.Lifecycle).FontSize(48).FontColor("#F0F2F4").SemiBold();
                }

                page.Content().AlignMiddle().Column(col =>
                {
                    col.Item().Text(DocumentDesign.Brand).SemiBold().FontSize(11)
                        .FontColor(DocumentDesign.Accent).LetterSpacing(0.12f);
                    col.Item().PaddingTop(28).Text(m.PropertyHorizontalName).SemiBold().FontSize(22);
                    col.Item().PaddingTop(36).LineHorizontal(1.5f).LineColor(DocumentDesign.Accent);
                    col.Item().PaddingTop(28).Text("ACTA DE ASAMBLEA").SemiBold().FontSize(18);
                    col.Item().PaddingTop(8).Text(m.Title).FontSize(13).FontColor(DocumentDesign.Muted);
                    col.Item().PaddingTop(20).Text($"Modalidad {DocumentLabels.Modality(m.Modality)}")
                        .FontSize(11).FontColor(DocumentDesign.Muted);
                    col.Item().PaddingTop(6).Text(DocumentDates.ShortDate(m.ScheduledAtUtc)).FontSize(14);
                    col.Item().PaddingTop(40).Row(row =>
                    {
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("Estado documental").FontSize(8).FontColor(DocumentDesign.Muted);
                            c.Item().Text(ctx.Lifecycle).SemiBold().FontSize(12);
                        });
                        row.RelativeItem().Column(c =>
                        {
                            c.Item().Text("Documento").FontSize(8).FontColor(DocumentDesign.Muted);
                            c.Item().Text(m.DocumentId).FontSize(9).FontFamily(Fonts.Consolas);
                        });
                    });
                });
            });

            // Body
            container.Page(page =>
            {
                DocumentDesign.PageChrome(
                    page,
                    m.PropertyHorizontalName,
                    m.Title,
                    "Acta",
                    m.DocumentId,
                    ctx.Lifecycle,
                    ctx.ShowDraftWatermark);

                page.Content().Column(col =>
                {
                    DocumentDesign.SectionTitle(col.Item(), "1. Información de la Asamblea");
                    DocumentDesign.KeyValue(col.Item(), "PH", m.PropertyHorizontalName);
                    DocumentDesign.KeyValue(col.Item(), "Título", m.Title);
                    DocumentDesign.KeyValue(col.Item(), "Modalidad", DocumentLabels.Modality(m.Modality));
                    DocumentDesign.KeyValue(col.Item(), "Programada", DocumentDates.Long(m.ScheduledAtUtc));
                    DocumentDesign.KeyValue(col.Item(), "Inicio", DocumentDates.Long(m.AssemblyStartedAtUtc));
                    DocumentDesign.KeyValue(col.Item(), "Cierre", DocumentDates.Long(m.CompletedAtUtc));
                    DocumentDesign.KeyValue(col.Item(), "Estado", DocumentLabels.AssemblyStatus(m.Status));

                    DocumentDesign.SectionTitle(col.Item(), "2. Constitución de la Asamblea");
                    if (m.Quorum is null)
                    {
                        col.Item().Text("Sin registro de quórum verificable al momento de generar este documento.")
                            .FontColor(DocumentDesign.Muted);
                    }
                    else
                    {
                        var q = m.Quorum;
                        DocumentDesign.StatStrip(col.Item(),
                            ("Quórum requerido", DocumentLabels.Coefficient(q.RequiredCoefficient)),
                            ("Quórum presente", DocumentLabels.Coefficient(q.CurrentCoefficient)),
                            ("Estado", DocumentLabels.QuorumStatus(null, q.QuorumReached)));
                        col.Item().PaddingTop(8);
                        DocumentDesign.KeyValue(col.Item(), "Calculado", DocumentDates.Long(q.CalculatedAtUtc));
                    }

                    DocumentDesign.SectionTitle(col.Item(), "3. Asistencia");
                    col.Item().Text($"Participantes listados: {m.Attendance.Count}").FontSize(10);
                    col.Item().PaddingTop(8).Element(e => AttendanceTable(e, m.Attendance));

                    DocumentDesign.SectionTitle(col.Item(), "4. Orden del Día");
                    if (m.Agenda.Count == 0)
                    {
                        col.Item().Text("Sin puntos de agenda registrados.").FontColor(DocumentDesign.Muted);
                    }
                    else
                    {
                        foreach (var a in m.Agenda.OrderBy(x => x.Ordinal))
                        {
                            col.Item().PaddingVertical(3).Text($"{a.Ordinal}. [{a.Code}] {a.Title}");
                        }
                    }

                    DocumentDesign.SectionTitle(col.Item(), "5. Desarrollo");
                    col.Item().Text(
                            "Esta sección solo incluye hechos registrados por el sistema. " +
                            "No se genera narrativa jurídica automática.")
                        .FontSize(9).FontColor(DocumentDesign.Muted);
                    if (m.Interventions.Count > 0)
                    {
                        col.Item().PaddingTop(6).Text($"Intervenciones registradas en cola: {m.Interventions.Count}.");
                    }
                    else
                    {
                        col.Item().PaddingTop(6).Text("Sin intervenciones adicionales verificables en el expediente.");
                    }

                    DocumentDesign.SectionTitle(col.Item(), "6. Votaciones");
                    if (m.Motions.Count == 0)
                    {
                        col.Item().Text("No hay votaciones cerradas registradas.").FontColor(DocumentDesign.Muted);
                    }
                    else
                    {
                        foreach (var entry in m.Motions)
                            MotionBlock(col.Item(), entry);
                    }

                    DocumentDesign.SectionTitle(col.Item(), "7. Decisiones");
                    DecisionsBlock(col, m.Decisions, m.Status);

                    DocumentDesign.SectionTitle(col.Item(), "8. Cierre");
                    if (m.CompletedAtUtc is null)
                    {
                        col.Item().Text(
                                $"Asamblea aún no finalizada ({DocumentLabels.AssemblyStatus(m.Status)}). " +
                                "Este documento no constituye acta definitiva.")
                            .FontColor(DocumentDesign.Warn);
                    }
                    else
                    {
                        DocumentDesign.KeyValue(col.Item(), "Cierre registrado", DocumentDates.Long(m.CompletedAtUtc));
                    }

                    DocumentDesign.SectionTitle(col.Item(), "9. Integridad documental");
                    IntegrityBlock(col, m.DocumentId, m.ContentHash, m.GeneratedAtUtc, ctx.Lifecycle, m.IsSealed);
                    col.Item().PaddingTop(12).Text(m.Disclaimer).FontSize(8).FontColor(DocumentDesign.Muted).Italic();
                });
            });
        }).GeneratePdf();
    }

    public static byte[] Attendance(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        DocumentDesign.EnsureLicense();
        var accredited = p.Attendance.Where(x => x.IsAccredited).ToList();
        var reps = p.Representations.Where(x => x.IsActive).ToList();
        var coef = accredited.Sum(x => x.EffectiveCoefficientPercent);
        var docId = ctx.DocCode("ASI");

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                DocumentDesign.PageChrome(page, p.PropertyHorizontalName, p.Title, "Asistencia", docId, ctx.Lifecycle, false);
                page.Content().Column(col =>
                {
                    col.Item().Text("REGISTRO DE ASISTENCIA").SemiBold().FontSize(16).FontColor(DocumentDesign.Accent);
                    col.Item().PaddingTop(12);
                    DocumentDesign.StatStrip(col.Item(),
                        ("Registrados", p.Attendance.Count.ToString()),
                        ("Acreditados", accredited.Count.ToString()),
                        ("Representados", reps.Count.ToString()),
                        ("Coef. acreditado", DocumentLabels.Coefficient(coef)));

                    DocumentDesign.SectionTitle(col.Item(), "Participantes");
                    col.Item().Element(e => AttendanceTable(e, p.Attendance.OrderBy(x => x.DisplayName).ToList()));

                    DocumentDesign.SectionTitle(col.Item(), "Representaciones");
                    if (reps.Count == 0)
                    {
                        col.Item().Text("Sin representaciones activas.").FontColor(DocumentDesign.Muted);
                    }
                    else
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(1.2f);
                                c.RelativeColumn(2.2f);
                                c.RelativeColumn(1.6f);
                                c.RelativeColumn(1.2f);
                            });
                            TableHeader(table, "Unidad", "Representado por", "Tipo", "Coeficiente");
                            foreach (var r in reps.OrderBy(x => x.UnitCode))
                            {
                                table.Cell().Element(CellBody).Text(r.UnitCode);
                                table.Cell().Element(CellBody).Text(r.RepresentativeDisplayName);
                                table.Cell().Element(CellBody).Text(DocumentLabels.RepresentationSource(r.Source));
                                table.Cell().Element(CellBody).AlignRight()
                                    .Text(DocumentLabels.Coefficient(r.CoefficientSnapshot));
                            }
                        });
                    }

                    DocumentDesign.SectionTitle(col.Item(), "Integridad documental");
                    IntegrityBlock(col, docId, ctx.ContentHash, ctx.GeneratedAtUtc, ctx.Lifecycle, ctx.IsSealed);
                });
            });
        }).GeneratePdf();
    }

    public static byte[] Quorum(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        DocumentDesign.EnsureLicense();
        var docId = ctx.DocCode("QUO");
        var compressed = PremiumTextDocuments.CompressSnapshots(p.QuorumSnapshots);
        var firstReached = p.QuorumSnapshots
            .OrderBy(s => s.TimestampUtc)
            .FirstOrDefault(s =>
                s.Status is "Reached" or "Met"
                || (p.LatestQuorum?.QuorumReached == true
                    && s.PresentCoefficient >= s.RequiredCoefficient));

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                DocumentDesign.PageChrome(page, p.PropertyHorizontalName, p.Title, "Quórum", docId, ctx.Lifecycle, false);
                page.Content().Column(col =>
                {
                    col.Item().Text("CERTIFICACIÓN DE QUÓRUM").SemiBold().FontSize(16).FontColor(DocumentDesign.Accent);
                    col.Item().PaddingTop(12);

                    if (p.LatestQuorum is null)
                    {
                        col.Item().Text("No hay cálculo de quórum registrado.").FontColor(DocumentDesign.Muted);
                    }
                    else
                    {
                        var q = p.LatestQuorum;
                        DocumentDesign.StatStrip(col.Item(),
                            ("Quórum requerido", DocumentLabels.Coefficient(q.RequiredCoefficient)),
                            ("Quórum alcanzado", DocumentLabels.Coefficient(q.CurrentCoefficient)),
                            ("Estado", DocumentLabels.QuorumStatus(null, q.QuorumReached)),
                            ("Cumplimiento", DocumentDates.Long(firstReached?.TimestampUtc ?? q.CalculatedAtUtc)));

                        col.Item().PaddingTop(16).Text("Nivel presente vs. mínimo").FontSize(9).FontColor(DocumentDesign.Muted);
                        col.Item().PaddingTop(6).Element(e => QuorumBar(e, q.CurrentCoefficient, q.RequiredCoefficient));
                    }

                    DocumentDesign.SectionTitle(col.Item(), "Evolución del quórum");
                    if (compressed.Count == 0)
                    {
                        col.Item().Text("Sin snapshots de quórum.").FontColor(DocumentDesign.Muted);
                    }
                    else
                    {
                        col.Item().Table(table =>
                        {
                            table.ColumnsDefinition(c =>
                            {
                                c.RelativeColumn(2.2f);
                                c.RelativeColumn(1.6f);
                                c.RelativeColumn(1.2f);
                                c.RelativeColumn(1.2f);
                            });
                            TableHeader(table, "Momento", "Estado", "Presente", "Requerido");
                            foreach (var s in compressed)
                            {
                                table.Cell().Element(CellBody).Text(DocumentDates.Long(s.TimestampUtc));
                                table.Cell().Element(CellBody).Text(DocumentLabels.QuorumStatus(s.Status));
                                table.Cell().Element(CellBody).AlignRight()
                                    .Text(DocumentLabels.Coefficient(s.PresentCoefficient));
                                table.Cell().Element(CellBody).AlignRight()
                                    .Text(DocumentLabels.Coefficient(s.RequiredCoefficient));
                            }
                        });
                        if (compressed.Count < p.QuorumSnapshots.Count)
                        {
                            col.Item().PaddingTop(6).Text(
                                    $"Se condensaron {p.QuorumSnapshots.Count - compressed.Count} lecturas consecutivas idénticas. " +
                                    "El detalle técnico completo está en la capa de evidencia (TXT).")
                                .FontSize(8).FontColor(DocumentDesign.Muted);
                        }
                    }

                    DocumentDesign.SectionTitle(col.Item(), "Integridad documental");
                    IntegrityBlock(col, docId, ctx.ContentHash, ctx.GeneratedAtUtc, ctx.Lifecycle, ctx.IsSealed);
                });
            });
        }).GeneratePdf();
    }

    public static byte[] Voting(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        DocumentDesign.EnsureLicense();
        var docId = ctx.DocCode("VOT");
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                DocumentDesign.PageChrome(page, p.PropertyHorizontalName, p.Title, "Votaciones", docId, ctx.Lifecycle, false);
                page.Content().Column(col =>
                {
                    col.Item().Text("INFORME DE VOTACIONES").SemiBold().FontSize(16).FontColor(DocumentDesign.Accent);
                    if (p.Voting.Count == 0)
                    {
                        col.Item().PaddingTop(12).Text("No hay mociones registradas.").FontColor(DocumentDesign.Muted);
                    }
                    else
                    {
                        foreach (var entry in p.Voting)
                            MotionBlock(col.Item(), entry);
                    }
                    DocumentDesign.SectionTitle(col.Item(), "Integridad documental");
                    IntegrityBlock(col, docId, ctx.ContentHash, ctx.GeneratedAtUtc, ctx.Lifecycle, ctx.IsSealed);
                });
            });
        }).GeneratePdf();
    }

    public static byte[] Decisions(AssemblyEvidencePackageDto p, DocumentExportContext ctx)
    {
        DocumentDesign.EnsureLicense();
        var docId = ctx.DocCode("DEC");
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                DocumentDesign.PageChrome(page, p.PropertyHorizontalName, p.Title, "Decisiones", docId, ctx.Lifecycle, false);
                page.Content().Column(col =>
                {
                    col.Item().Text("REGISTRO DE DECISIONES").SemiBold().FontSize(16).FontColor(DocumentDesign.Accent);
                    col.Item().PaddingTop(8);
                    DecisionsBlock(col, p.Decisions, p.Status);
                    DocumentDesign.SectionTitle(col.Item(), "Integridad documental");
                    IntegrityBlock(col, docId, ctx.ContentHash, ctx.GeneratedAtUtc, ctx.Lifecycle, ctx.IsSealed);
                });
            });
        }).GeneratePdf();
    }

    public static byte[] Integrity(AssemblyEvidencePackageDto p, DocumentExportContext ctx, int recordingCount)
    {
        DocumentDesign.EnsureLicense();
        var docId = ctx.DocCode("INT");
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                DocumentDesign.PageChrome(page, p.PropertyHorizontalName, p.Title, "Integridad", docId, ctx.Lifecycle, false);
                page.Content().Column(col =>
                {
                    col.Item().Text("RESUMEN DE INTEGRIDAD").SemiBold().FontSize(16).FontColor(DocumentDesign.Accent);
                    col.Item().PaddingTop(12);
                    DocumentDesign.KeyValue(col.Item(), "Asamblea", p.Title);
                    DocumentDesign.KeyValue(col.Item(), "PH", p.PropertyHorizontalName);
                    DocumentDesign.KeyValue(col.Item(), "Estado", DocumentLabels.AssemblyStatus(p.Status));
                    DocumentDesign.KeyValue(col.Item(), "Documento", ctx.Lifecycle);
                    DocumentDesign.KeyValue(col.Item(), "Generado", DocumentDates.Long(ctx.GeneratedAtUtc));
                    DocumentDesign.KeyValue(col.Item(), "Completitud", DocumentLabelExtras.Completeness(p.Completeness.Status));
                    DocumentDesign.KeyValue(col.Item(), "Eventos", p.Timeline.Count.ToString());
                    DocumentDesign.KeyValue(col.Item(), "Grabaciones (ref.)", recordingCount.ToString());
                    foreach (var note in p.Completeness.Notes)
                        col.Item().PaddingTop(2).Text($"· {note}").FontSize(9).FontColor(DocumentDesign.Muted);

                    DocumentDesign.SectionTitle(col.Item(), "Documentos del expediente");
                    foreach (var name in new[]
                             {
                                 "Acta", "Asistencia", "Quórum", "Votaciones", "Decisiones",
                                 "Resumen de integridad", "Auditoría técnica", "Manifest.json"
                             })
                    {
                        col.Item().PaddingVertical(2).Text($"• {name}");
                    }

                    DocumentDesign.SectionTitle(col.Item(), "Integridad del acta (hechos)");
                    IntegrityBlock(col, ctx.DocumentId, ctx.ContentHash, ctx.GeneratedAtUtc, ctx.Lifecycle, ctx.IsSealed);
                    col.Item().PaddingTop(8).Text(
                            "El hash SHA-256 del acta sella el payload JSON de hechos verificados " +
                            "(asistencia, quórum, agenda, votaciones cerradas, decisiones). " +
                            "No hashea los bytes del PDF. Cada archivo del ZIP declara su SHA-256 en Manifest.json.")
                        .FontSize(8).FontColor(DocumentDesign.Muted);
                });
            });
        }).GeneratePdf();
    }

    private static void MotionBlock(IContainer container, AssemblyMinutesMotionEntryDto entry)
    {
        container.PaddingTop(10).Element(DocumentDesign.Card).Column(col =>
        {
            var m = entry.Motion;
            col.Item().Text(m.Code).SemiBold().FontSize(11).FontColor(DocumentDesign.Accent);
            col.Item().PaddingTop(4).Text(m.QuestionText ?? m.Title).SemiBold().FontSize(11);
            if (!string.IsNullOrWhiteSpace(m.Body) && m.Body != m.Title && m.Body != m.QuestionText)
                col.Item().PaddingTop(2).Text(m.Body).FontSize(9).FontColor(DocumentDesign.Muted);

            DocumentDesign.KeyValue(col.Item(), "Método", DocumentLabelExtras.CalculationMethod(m.CalculationMethod));
            DocumentDesign.KeyValue(col.Item(), "Mayoría", DocumentLabelExtras.DecisionRule(m.DecisionRuleCode));

            if (entry.ClosedSession is null)
            {
                col.Item().PaddingTop(6).Text("Estado: No sometida a votación").SemiBold()
                    .FontColor(DocumentDesign.Muted);
                return;
            }

            var s = entry.ClosedSession;
            DocumentDesign.KeyValue(col.Item(), "Estado", DocumentLabels.VotingSessionStatus(s.Status));
            DocumentDesign.KeyValue(col.Item(), "Apertura", DocumentDates.Long(s.OpenedAtUtc));
            DocumentDesign.KeyValue(col.Item(), "Cierre", DocumentDates.Long(s.ClosedAtUtc));

            if (entry.Results is not null)
            {
                var r = entry.Results;
                col.Item().PaddingTop(8);
                DocumentDesign.StatStrip(col.Item(),
                    ("A favor", $"{r.InFavorVotes} · {DocumentLabels.Coefficient(r.InFavorCoefficient)}"),
                    ("En contra", $"{r.AgainstVotes} · {DocumentLabels.Coefficient(r.AgainstCoefficient)}"),
                    ("Abstención", $"{r.AbstentionVotes} · {DocumentLabels.Coefficient(r.AbstentionCoefficient)}"),
                    ("Total", r.VotesCast.ToString()));
                col.Item().PaddingTop(6);
                DocumentDesign.KeyValue(col.Item(), "Resultado", DocumentLabels.DecisionStatus(r.DecisionStatus));
                if (!string.IsNullOrWhiteSpace(r.DecisionExplanation))
                    col.Item().PaddingTop(4).Text(r.DecisionExplanation).FontSize(9);

                var total = Math.Max(0.0001m, r.InFavorCoefficient + r.AgainstCoefficient + r.AbstentionCoefficient);
                col.Item().PaddingTop(10).Element(e => ResultBar(e,
                    (float)(r.InFavorCoefficient / total),
                    (float)(r.AgainstCoefficient / total),
                    (float)(r.AbstentionCoefficient / total)));
            }
        });
    }

    private static void DecisionsBlock(ColumnDescriptor col, IReadOnlyList<DecisionDto> decisions, string assemblyStatus)
    {
        if (decisions.Count == 0)
        {
            col.Item().Element(DocumentDesign.Card).Column(c =>
            {
                c.Item().Text("No existen decisiones formalmente cerradas al momento de generar este documento.")
                    .SemiBold();
                c.Item().PaddingTop(6).Text($"Estado de la asamblea: {DocumentLabels.AssemblyStatus(assemblyStatus)}")
                    .FontSize(9).FontColor(DocumentDesign.Muted);
            });
            return;
        }

        foreach (var d in decisions)
        {
            col.Item().PaddingTop(8).Element(DocumentDesign.Card).Column(c =>
            {
                c.Item().Text(d.DecisionNumber).SemiBold().FontSize(11).FontColor(DocumentDesign.Accent);
                c.Item().PaddingTop(4).Text($"{d.MotionCode} — {d.MotionTitle}").FontSize(11);
                DocumentDesign.KeyValue(c.Item(), "Resultado", DocumentLabels.DecisionStatus(d.DecisionStatus));
                DocumentDesign.KeyValue(c.Item(), "Regla", DocumentLabelExtras.DecisionRule(d.AppliedDecisionRule));
                DocumentDesign.KeyValue(c.Item(), "Fecha", DocumentDates.Long(d.DecidedAtUtc));
                DocumentDesign.KeyValue(c.Item(), "A favor", DocumentLabels.Coefficient(d.InFavorCoefficient));
                DocumentDesign.KeyValue(c.Item(), "En contra", DocumentLabels.Coefficient(d.AgainstCoefficient));
                DocumentDesign.KeyValue(c.Item(), "Abstención", DocumentLabels.Coefficient(d.AbstentionCoefficient));
                DocumentDesign.KeyValue(c.Item(), "Votos", d.VotesCast.ToString());
                DocumentDesign.KeyValue(c.Item(), "Secreta", DocumentLabels.YesNo(d.SecretBallot));
                if (!string.IsNullOrWhiteSpace(d.Explanation))
                    c.Item().PaddingTop(6).Text(d.Explanation).FontSize(9);
            });
        }
    }

    private static void IntegrityBlock(
        ColumnDescriptor col,
        string documentId,
        string? hash,
        DateTimeOffset generatedAt,
        string lifecycle,
        bool sealedFlag)
    {
        DocumentDesign.KeyValue(col.Item(), "Identificador", documentId);
        col.Item().PaddingVertical(2).Row(row =>
        {
            row.ConstantItem(150).Text("Hash SHA-256").FontSize(9).FontColor(DocumentDesign.Muted);
            row.RelativeItem().Text(hash ?? "—").FontSize(8).FontFamily(Fonts.Consolas);
        });
        DocumentDesign.KeyValue(col.Item(), "Generado", DocumentDates.Long(generatedAt));
        DocumentDesign.KeyValue(col.Item(), "Estado", lifecycle);
        DocumentDesign.KeyValue(col.Item(), "Sellado", DocumentLabels.YesNo(sealedFlag));
    }

    private static void AttendanceTable(IContainer container, IReadOnlyList<AssemblyParticipantDto> rows)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(c =>
            {
                c.RelativeColumn(2.4f);
                c.RelativeColumn(0.9f);
                c.RelativeColumn(1.4f);
                c.RelativeColumn(1.5f);
                c.RelativeColumn(1.1f);
            });
            TableHeader(table, "Propietario / Participante", "Unidad", "Calidad", "Estado", "Coeficiente");
            foreach (var p in rows)
            {
                table.Cell().Element(CellBody).Text(p.DisplayName);
                table.Cell().Element(CellBody).Text(p.UnitCode ?? "—");
                table.Cell().Element(CellBody).Text(DocumentLabels.Role(p.RoleCode));
                table.Cell().Element(CellBody).Text(
                    $"{DocumentLabels.AttendanceStatus(p.AttendanceStatus)} · {DocumentLabels.Accreditation(p.IsAccredited)}");
                table.Cell().Element(CellBody).AlignRight()
                    .Text(DocumentLabels.Coefficient(p.EffectiveCoefficientPercent));
            }
        });
    }

    private static void TableHeader(TableDescriptor table, params string[] headers)
    {
        foreach (var h in headers)
        {
            table.Cell().Element(c => c.Background(DocumentDesign.Soft).BorderBottom(1).BorderColor(DocumentDesign.Line)
                .Padding(6)).Text(h).SemiBold().FontSize(8).FontColor(DocumentDesign.Muted);
        }
    }

    private static IContainer CellBody(IContainer c) =>
        c.BorderBottom(0.5f).BorderColor(DocumentDesign.Line).PaddingVertical(5).PaddingHorizontal(6);

    private static void QuorumBar(IContainer container, decimal present, decimal required)
    {
        var pct = (float)Math.Clamp((double)(present / 100m), 0, 1);
        container.Column(col =>
        {
            col.Item().Height(18).Background(DocumentDesign.Soft).Border(1).BorderColor(DocumentDesign.Line)
                .Row(row =>
                {
                    row.RelativeItem(Math.Max(0.001f, pct)).Background(DocumentDesign.Accent);
                    row.RelativeItem(Math.Max(0.001f, 1 - pct));
                });
            col.Item().PaddingTop(4).Row(row =>
            {
                row.RelativeItem().Text($"Presente {DocumentLabels.Coefficient(present)}")
                    .FontSize(8).FontColor(DocumentDesign.Muted);
                row.RelativeItem().AlignRight().Text($"Mínimo {DocumentLabels.Coefficient(required)}")
                    .FontSize(8).FontColor(DocumentDesign.Warn);
            });
        });
    }

    private static void ResultBar(IContainer container, float favor, float against, float abstain)
    {
        container.Column(col =>
        {
            col.Item().Height(12).Row(row =>
            {
                if (favor > 0) row.RelativeItem(favor).Background(DocumentDesign.Ok);
                if (against > 0) row.RelativeItem(against).Background(DocumentDesign.Danger);
                if (abstain > 0) row.RelativeItem(abstain).Background("#9AA3AF");
            });
            col.Item().PaddingTop(4).Text("Verde: a favor · Rojo: en contra · Gris: abstención")
                .FontSize(7).FontColor(DocumentDesign.Muted);
        });
    }
}
