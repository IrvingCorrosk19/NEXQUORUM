namespace Asambleas.Application.Documents;

using System.Text;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

/// <summary>Shared visual tokens and chrome for ASAMBLEAS evidence PDFs.</summary>
public static class DocumentDesign
{
    public static readonly string Brand = "ASAMBLEAS";
    public static readonly string Ink = "#1A2332";
    public static readonly string Muted = "#5B6573";
    public static readonly string Line = "#D5DBE3";
    public static readonly string Soft = "#F4F6F8";
    public static readonly string Accent = "#0F4C5C";
    public static readonly string AccentSoft = "#E6F1F3";
    public static readonly string Danger = "#8B1E1E";
    public static readonly string Warn = "#8A5A00";
    public static readonly string Ok = "#1F6B3A";

    public static void EnsureLicense()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public static byte[] Utf8Text(string content)
    {
        // BOM so Windows editors detect UTF-8 (avoids VerificaciÃ³n).
        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(content)).ToArray();
    }

    public static IContainer Card(IContainer container) =>
        container
            .Border(1)
            .BorderColor(Line)
            .Background(Colors.White)
            .Padding(14);

    public static void PageChrome(
        PageDescriptor page,
        string phName,
        string assemblyTitle,
        string documentTitle,
        string documentId,
        string lifecycle,
        bool watermarkDraft)
    {
        page.Size(PageSizes.A4);
        page.MarginTop(56);
        page.MarginBottom(52);
        page.MarginHorizontal(48);
        page.DefaultTextStyle(x => x.FontSize(10).FontColor(Ink).LineHeight(1.35f));

        page.Header().Element(h =>
        {
            h.Column(col =>
            {
                col.Item().Row(row =>
                {
                    row.RelativeItem().Column(c =>
                    {
                        c.Item().Text(Brand).SemiBold().FontSize(9).FontColor(Accent).LetterSpacing(0.08f);
                        c.Item().Text(phName).SemiBold().FontSize(12).FontColor(Ink);
                    });
                    row.ConstantItem(160).AlignRight().Column(c =>
                    {
                        c.Item().AlignRight().Text(documentTitle).FontSize(9).FontColor(Muted);
                        c.Item().AlignRight().Text(lifecycle).SemiBold().FontSize(9)
                            .FontColor(lifecycle is "FINAL" ? Ok : Warn);
                    });
                });
                col.Item().PaddingTop(6).Text(assemblyTitle).FontSize(9).FontColor(Muted);
                col.Item().PaddingTop(8).LineHorizontal(1).LineColor(Line);
            });
        });

        page.Footer().Element(f =>
        {
            f.Column(col =>
            {
                col.Item().LineHorizontal(1).LineColor(Line);
                col.Item().PaddingTop(8).Row(row =>
                {
                    row.RelativeItem().Text(text =>
                    {
                        text.Span($"{Brand} · {phName}").FontSize(8).FontColor(Muted);
                        text.Span("  ·  ").FontSize(8).FontColor(Line);
                        text.Span("Documento generado electrónicamente").FontSize(8).FontColor(Muted);
                    });
                    row.ConstantItem(120).AlignRight().Text(text =>
                    {
                        text.Span("Página ").FontSize(8).FontColor(Muted);
                        text.CurrentPageNumber().FontSize(8).FontColor(Muted);
                        text.Span(" de ").FontSize(8).FontColor(Muted);
                        text.TotalPages().FontSize(8).FontColor(Muted);
                    });
                });
                col.Item().Text(ShortId(documentId)).FontSize(7).FontColor(Muted).FontFamily(Fonts.Consolas);
            });
        });

        if (watermarkDraft)
        {
            page.Foreground().AlignCenter().AlignMiddle().Text(lifecycle)
                .FontSize(48).FontColor("#F0F2F4").SemiBold();
        }
    }

    public static string ShortId(string documentId)
    {
        if (string.IsNullOrWhiteSpace(documentId)) return "";
        return documentId.Length <= 28 ? documentId : documentId[..24] + "…";
    }

    public static void SectionTitle(IContainer container, string title) =>
        container.PaddingTop(16).PaddingBottom(8).Text(title).SemiBold().FontSize(13).FontColor(Accent);

    public static void KeyValue(IContainer container, string key, string value) =>
        container.PaddingVertical(2).Row(row =>
        {
            row.ConstantItem(150).Text(key).FontSize(9).FontColor(Muted);
            row.RelativeItem().Text(value).FontSize(10).FontColor(Ink);
        });

    public static void StatStrip(IContainer container, params (string Label, string Value)[] stats) =>
        container.Row(row =>
        {
            foreach (var (label, value) in stats)
            {
                row.RelativeItem().Border(1).BorderColor(Line).Background(Soft).Padding(10).Column(c =>
                {
                    c.Item().Text(label).FontSize(8).FontColor(Muted);
                    c.Item().PaddingTop(2).Text(value).SemiBold().FontSize(14).FontColor(Ink);
                });
            }
        });
}
