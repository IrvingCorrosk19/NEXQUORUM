namespace Asambleas.Infrastructure.PhOnboarding;

using Asambleas.Application.Abstractions;
using ClosedXML.Excel;

public sealed class PhImportWorkbookService : IPhImportWorkbookService
{
    private static readonly string[] TemplateHeaders =
    [
        "Unidad", "Torre", "Piso", "Coeficiente", "Nombre", "Apellido", "Identificacion", "Email", "Telefono"
    ];

    public byte[] BuildTemplate()
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Importacion");
        for (var i = 0; i < TemplateHeaders.Length; i++)
        {
            sheet.Cell(1, i + 1).Value = TemplateHeaders[i];
            sheet.Cell(1, i + 1).Style.Font.Bold = true;
        }

        sheet.Cell(2, 1).Value = "8B";
        sheet.Cell(2, 2).Value = "Torre 1";
        sheet.Cell(2, 3).Value = 8;
        sheet.Cell(2, 4).Value = 0.4231m;
        sheet.Cell(2, 5).Value = "Maria";
        sheet.Cell(2, 6).Value = "Gonzalez";
        sheet.Cell(2, 7).Value = "8-888-888";
        sheet.Cell(2, 8).Value = "maria@example.com";
        sheet.Cell(2, 9).Value = "+50760000000";
        sheet.Columns().AdjustToContents();

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public byte[] BuildErrorReport(IReadOnlyList<(int Row, string Field, string? Value, string Problem, string Action)> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Errores");
        sheet.Cell(1, 1).Value = "Fila";
        sheet.Cell(1, 2).Value = "Campo";
        sheet.Cell(1, 3).Value = "Valor";
        sheet.Cell(1, 4).Value = "Problema";
        sheet.Cell(1, 5).Value = "Accion sugerida";
        sheet.Range(1, 1, 1, 5).Style.Font.Bold = true;

        var r = 2;
        foreach (var row in rows)
        {
            sheet.Cell(r, 1).Value = row.Row;
            sheet.Cell(r, 2).Value = row.Field;
            sheet.Cell(r, 3).Value = row.Value ?? string.Empty;
            sheet.Cell(r, 4).Value = row.Problem;
            sheet.Cell(r, 5).Value = row.Action;
            r++;
        }

        sheet.Columns().AdjustToContents();
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public (IReadOnlyList<string> Headers, IReadOnlyList<string[]> Rows) ParseWorkbook(Stream xlsxStream)
    {
        ArgumentNullException.ThrowIfNull(xlsxStream);
        using var workbook = new XLWorkbook(xlsxStream);
        var sheet = workbook.Worksheets.First();
        var used = sheet.RangeUsed();
        if (used is null)
        {
            return (Array.Empty<string>(), Array.Empty<string[]>());
        }

        var firstRow = used.FirstRow().RowNumber();
        var lastRow = used.LastRow().RowNumber();
        var firstCol = used.FirstColumn().ColumnNumber();
        var lastCol = used.LastColumn().ColumnNumber();

        var headers = new List<string>();
        for (var c = firstCol; c <= lastCol; c++)
        {
            headers.Add(sheet.Cell(firstRow, c).GetString().Trim());
        }

        var rows = new List<string[]>();
        for (var r = firstRow + 1; r <= lastRow; r++)
        {
            var values = new string[headers.Count];
            var empty = true;
            for (var i = 0; i < headers.Count; i++)
            {
                values[i] = sheet.Cell(r, firstCol + i).GetFormattedString().Trim();
                if (!string.IsNullOrWhiteSpace(values[i]))
                {
                    empty = false;
                }
            }

            if (!empty)
            {
                rows.Add(values);
            }
        }

        return (headers, rows);
    }
}
