namespace Asambleas.Infrastructure.Motion;

using Asambleas.Application.Abstractions;
using ClosedXML.Excel;

public sealed class MotionImportWorkbookService : IMotionImportWorkbookService
{
    public static readonly string[] ExpectedHeaders =
    [
        "Orden", "PuntoAgenda", "Codigo", "TituloCorto", "Pregunta", "Instrucciones",
        "TipoRespuesta", "Opcion1", "Opcion2", "Opcion3", "Opcion4", "Opcion5",
        "Metodo", "Mayoria", "UmbralPorcentaje", "VisibilidadResultado", "VotoSecreto", "EstadoImportacion"
    ];

    public byte[] BuildTemplate(
        IReadOnlyList<(string Code, string Title)> agendaItems,
        IReadOnlyList<(string Code, string Label)> ballotKinds,
        IReadOnlyList<(string Code, string Label)> methods,
        IReadOnlyList<(string Code, string Label)> rules,
        IReadOnlyList<(string Code, string Label)> visibility,
        string assemblyLabel)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Preguntas");
        for (var i = 0; i < ExpectedHeaders.Length; i++)
        {
            sheet.Cell(1, i + 1).Value = ExpectedHeaders[i];
            sheet.Cell(1, i + 1).Style.Font.Bold = true;
        }

        var agendaCode = agendaItems.Count > 0 ? agendaItems[0].Code : "A01";
        sheet.Cell(2, 1).Value = 1;
        sheet.Cell(2, 2).Value = agendaCode;
        sheet.Cell(2, 3).Value = "";
        sheet.Cell(2, 4).Value = "Aprobacion del presupuesto";
        sheet.Cell(2, 5).Value = "¿Aprueba el presupuesto extraordinario presentado por la Junta Directiva?";
        sheet.Cell(2, 6).Value = "Seleccione una opcion";
        sheet.Cell(2, 7).Value = "A favor / En contra / Abstencion";
        sheet.Cell(2, 8).Value = "A favor";
        sheet.Cell(2, 9).Value = "En contra";
        sheet.Cell(2, 10).Value = "Abstencion";
        sheet.Cell(2, 13).Value = "Por coeficiente";
        sheet.Cell(2, 14).Value = "Mayoria simple";
        sheet.Cell(2, 16).Value = "Oculto hasta cierre";
        sheet.Cell(2, 17).Value = "No";
        sheet.Cell(2, 18).Value = "Borrador";

        var catalogs = workbook.Worksheets.Add("Catalogos");
        catalogs.Cell(1, 1).Value = "PuntosAgenda";
        catalogs.Cell(1, 2).Value = "TiposRespuesta";
        catalogs.Cell(1, 3).Value = "Metodos";
        catalogs.Cell(1, 4).Value = "Mayorias";
        catalogs.Cell(1, 5).Value = "Visibilidad";
        catalogs.Cell(1, 6).Value = "SiNo";
        catalogs.Cell(1, 7).Value = "Estados";
        catalogs.Range(1, 1, 1, 7).Style.Font.Bold = true;

        for (var i = 0; i < agendaItems.Count; i++)
            catalogs.Cell(i + 2, 1).Value = agendaItems[i].Code + " — " + agendaItems[i].Title;
        for (var i = 0; i < ballotKinds.Count; i++)
            catalogs.Cell(i + 2, 2).Value = ballotKinds[i].Label;
        for (var i = 0; i < methods.Count; i++)
            catalogs.Cell(i + 2, 3).Value = methods[i].Label;
        for (var i = 0; i < rules.Count; i++)
            catalogs.Cell(i + 2, 4).Value = rules[i].Label;
        for (var i = 0; i < visibility.Count; i++)
            catalogs.Cell(i + 2, 5).Value = visibility[i].Label;
        catalogs.Cell(2, 6).Value = "Si";
        catalogs.Cell(3, 6).Value = "No";
        catalogs.Cell(2, 7).Value = "Borrador";
        catalogs.Cell(3, 7).Value = "Publicar";

        var meta = workbook.Worksheets.Add("Instrucciones");
        meta.Cell(1, 1).Value = "Plantilla de importacion de preguntas — ASAMBLEAS";
        meta.Cell(2, 1).Value = "Asamblea: " + (assemblyLabel ?? "");
        meta.Cell(3, 1).Value = "No cambie los encabezados de la hoja Preguntas.";
        meta.Cell(4, 1).Value = "Una fila = una pregunta. Use los valores de la hoja Catalogos.";
        meta.Cell(5, 1).Value = "Tipo estandar: A favor / En contra / Abstencion con Opcion1-3 correspondientes.";
        meta.Cell(6, 1).Value = "UmbralPorcentaje solo si la mayoria es Mayoria calificada (0-100].";
        meta.Cell(7, 1).Value = "EstadoImportacion: Borrador (recomendado) o Publicar.";
        meta.Cell(8, 1).Value = "Guarde como .xlsx o exporte CSV UTF-8. La importacion no publica sola sin confirmacion.";
        meta.Columns().AdjustToContents();
        sheet.Columns().AdjustToContents();
        catalogs.Columns().AdjustToContents();

        // Data validation lists (best-effort; Excel may ignore in some viewers)
        TryAddListValidation(sheet, "B2:B500", catalogs.Range(2, 1, Math.Max(2, agendaItems.Count + 1), 1));
        TryAddListValidation(sheet, "G2:G500", catalogs.Range(2, 2, Math.Max(2, ballotKinds.Count + 1), 2));
        TryAddListValidation(sheet, "M2:M500", catalogs.Range(2, 3, Math.Max(2, methods.Count + 1), 3));
        TryAddListValidation(sheet, "N2:N500", catalogs.Range(2, 4, Math.Max(2, rules.Count + 1), 4));
        TryAddListValidation(sheet, "P2:P500", catalogs.Range(2, 5, Math.Max(2, visibility.Count + 1), 5));
        TryAddListValidation(sheet, "Q2:Q500", catalogs.Range(2, 6, 3, 6));
        TryAddListValidation(sheet, "R2:R500", catalogs.Range(2, 7, 3, 7));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static void TryAddListValidation(IXLWorksheet sheet, string rangeAddress, IXLRange listRange)
    {
        try
        {
            var validation = sheet.Range(rangeAddress).CreateDataValidation();
            validation.List(listRange, true);
        }
        catch
        {
            // Best-effort; catalogs sheet still documents allowed values.
        }
    }

    public (IReadOnlyList<string> Headers, IReadOnlyList<string[]> Rows) ParseWorkbook(Stream xlsxStream)
    {
        ArgumentNullException.ThrowIfNull(xlsxStream);
        using var workbook = new XLWorkbook(xlsxStream);
        var sheet = workbook.Worksheets.FirstOrDefault(w =>
            w.Name.Equals("Preguntas", StringComparison.OrdinalIgnoreCase))
            ?? workbook.Worksheets.First();
        var used = sheet.RangeUsed();
        if (used is null)
        {
            return (Array.Empty<string>(), Array.Empty<string[]>());
        }

        var firstRow = used.FirstRow().RowNumber();
        var lastRow = used.LastRow().RowNumber();
        var firstCol = used.FirstColumn().ColumnNumber();
        var lastCol = Math.Min(used.LastColumn().ColumnNumber(), firstCol + ExpectedHeaders.Length + 5);

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
                var cell = sheet.Cell(r, firstCol + i);
                var raw = cell.GetFormattedString().Trim();
                if (raw.StartsWith('=') || raw.StartsWith('+') || raw.StartsWith('-') || raw.StartsWith('@'))
                {
                    // Neutralize formula-looking cells for safety (store as text without formula execution).
                    raw = "'" + raw;
                }
                values[i] = raw;
                if (!string.IsNullOrWhiteSpace(values[i])) empty = false;
            }
            if (!empty) rows.Add(values);
        }

        return (headers, rows);
    }
}