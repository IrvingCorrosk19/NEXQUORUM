namespace Asambleas.Application.Evidence;

using System.Text;

/// <summary>Minimal single-page text PDF writer (Helvetica, Latin-1 safe subset).</summary>
internal static class SimplePdf
{
    public static byte[] WriteTextDocument(string title, IEnumerable<string> lines)
    {
        var content = new StringBuilder();
        content.AppendLine("BT");
        content.AppendLine("/F1 14 Tf");
        content.AppendLine("50 780 Td");
        content.AppendLine($"{PdfString(title)} Tj");
        content.AppendLine("/F1 10 Tf");
        content.AppendLine("0 -24 Td");

        var yUsed = 24;
        foreach (var raw in lines)
        {
            foreach (var line in Wrap(raw, 95))
            {
                if (yUsed > 720)
                {
                    break;
                }

                content.AppendLine($"{PdfString(line)} Tj");
                content.AppendLine("0 -14 Td");
                yUsed += 14;
            }
        }

        content.AppendLine("ET");
        var stream = Encoding.ASCII.GetBytes(content.ToString());

        var objects = new List<byte[]>();
        objects.Add(Encoding.ASCII.GetBytes("<< /Type /Catalog /Pages 2 0 R >>"));
        objects.Add(Encoding.ASCII.GetBytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
        objects.Add(Encoding.ASCII.GetBytes(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"));
        objects.Add(Encoding.ASCII.GetBytes($"<< /Length {stream.Length} >>\nstream\n")
            .Concat(stream)
            .Concat(Encoding.ASCII.GetBytes("\nendstream"))
            .ToArray());
        objects.Add(Encoding.ASCII.GetBytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));

        using var ms = new MemoryStream();
        void WriteAscii(string s) => ms.Write(Encoding.ASCII.GetBytes(s));

        WriteAscii("%PDF-1.4\n");
        var offsets = new List<long> { 0 };
        for (var i = 0; i < objects.Count; i++)
        {
            offsets.Add(ms.Position);
            WriteAscii($"{i + 1} 0 obj\n");
            ms.Write(objects[i]);
            WriteAscii("\nendobj\n");
        }

        var xref = ms.Position;
        WriteAscii($"xref\n0 {objects.Count + 1}\n");
        WriteAscii("0000000000 65535 f \n");
        for (var i = 1; i < offsets.Count; i++)
        {
            WriteAscii($"{offsets[i]:D10} 00000 n \n");
        }

        WriteAscii($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\n");
        WriteAscii($"startxref\n{xref}\n%%EOF");
        return ms.ToArray();
    }

    private static IEnumerable<string> Wrap(string text, int width)
    {
        if (string.IsNullOrEmpty(text))
        {
            yield return string.Empty;
            yield break;
        }

        var remaining = Sanitize(text);
        while (remaining.Length > width)
        {
            var cut = remaining.LastIndexOf(' ', width);
            if (cut <= 0)
            {
                cut = width;
            }

            yield return remaining[..cut];
            remaining = remaining[cut..].TrimStart();
        }

        yield return remaining;
    }

    private static string Sanitize(string text)
    {
        var sb = new StringBuilder(text.Length);
        foreach (var ch in text)
        {
            if (ch is '\\' or '(' or ')')
            {
                sb.Append('\\').Append(ch);
            }
            else if (ch < 32 || ch > 126)
            {
                sb.Append('?');
            }
            else
            {
                sb.Append(ch);
            }
        }

        return sb.ToString();
    }

    private static string PdfString(string text) => $"({Sanitize(text)})";
}
