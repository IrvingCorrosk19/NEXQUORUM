namespace Asambleas.Infrastructure.PhOnboarding;

using Asambleas.Application.Abstractions;
using ClosedXML.Excel;

public sealed class PhImportWorkbookService : IPhImportWorkbookService
{
    public static readonly string[] UnitHeaders =
    [
        "CodigoUnidad", "TorreBloque", "Piso", "TipoUnidad", "Coeficiente", "Estado"
    ];

    public static readonly string[] OwnerHeaders =
    [
        "TipoIdentificacion", "NumeroIdentificacion", "Nombres", "Apellidos",
        "NombreCompletoRazonSocial", "Correo", "Telefono", "Estado"
    ];

    public static readonly string[] RelationHeaders =
    [
        "NumeroIdentificacion", "Correo", "CodigoUnidad", "PorcentajePropiedad", "Estado"
    ];

    public byte[] BuildTemplate(string phName)
    {
        using var workbook = new XLWorkbook();

        var units = workbook.Worksheets.Add("Unidades");
        WriteHeader(units, UnitHeaders);
        units.Cell(2, 1).Value = "8B";
        units.Cell(2, 2).Value = "Torre 1";
        units.Cell(2, 3).Value = 8;
        units.Cell(2, 4).Value = "Apartamento";
        units.Cell(2, 5).Value = 1.2500m;
        units.Cell(2, 6).Value = "Activa";
        units.Cell(3, 1).Value = "LC-01";
        units.Cell(3, 2).Value = "Torre 1";
        units.Cell(3, 3).Value = 1;
        units.Cell(3, 4).Value = "Local";
        units.Cell(3, 5).Value = 0.8500m;
        units.Cell(3, 6).Value = "Activa";
        units.Cell(4, 1).Value = "PH-01";
        units.Cell(4, 2).Value = "Torre 2";
        units.Cell(4, 3).Value = 0;
        units.Cell(4, 4).Value = "Parqueo";
        units.Cell(4, 5).Value = 0.1200m;
        units.Cell(4, 6).Value = "Activa";

        var owners = workbook.Worksheets.Add("Propietarios");
        WriteHeader(owners, OwnerHeaders);
        owners.Cell(2, 1).Value = "Cédula";
        owners.Cell(2, 2).Value = "8-888-888";
        owners.Cell(2, 3).Value = "María";
        owners.Cell(2, 4).Value = "González";
        owners.Cell(2, 5).Value = "María González";
        owners.Cell(2, 6).Value = "maria@example.com";
        owners.Cell(2, 7).Value = "+50760000001";
        owners.Cell(2, 8).Value = "Borrador";
        owners.Cell(3, 1).Value = "RUC";
        owners.Cell(3, 2).Value = "155123456-2-2020";
        owners.Cell(3, 3).Value = "";
        owners.Cell(3, 4).Value = "";
        owners.Cell(3, 5).Value = "Inversiones ABC, S.A.";
        owners.Cell(3, 6).Value = "contacto@abc.example.com";
        owners.Cell(3, 7).Value = "+50760000002";
        owners.Cell(3, 8).Value = "Borrador";
        owners.Cell(4, 1).Value = "Pasaporte";
        owners.Cell(4, 2).Value = "P1234567";
        owners.Cell(4, 3).Value = "John";
        owners.Cell(4, 4).Value = "Smith";
        owners.Cell(4, 5).Value = "John Smith";
        owners.Cell(4, 6).Value = "john.smith@example.com";
        owners.Cell(4, 7).Value = "";
        owners.Cell(4, 8).Value = "Borrador";

        var relations = workbook.Worksheets.Add("PropietarioUnidad");
        WriteHeader(relations, RelationHeaders);
        relations.Cell(2, 1).Value = "8-888-888";
        relations.Cell(2, 2).Value = "maria@example.com";
        relations.Cell(2, 3).Value = "8B";
        relations.Cell(2, 4).Value = 100;
        relations.Cell(2, 5).Value = "Activa";
        relations.Cell(3, 1).Value = "155123456-2-2020";
        relations.Cell(3, 2).Value = "contacto@abc.example.com";
        relations.Cell(3, 3).Value = "LC-01";
        relations.Cell(3, 4).Value = 100;
        relations.Cell(3, 5).Value = "Activa";
        relations.Cell(4, 1).Value = "P1234567";
        relations.Cell(4, 2).Value = "john.smith@example.com";
        relations.Cell(4, 3).Value = "PH-01";
        relations.Cell(4, 4).Value = 100;
        relations.Cell(4, 5).Value = "Activa";

        var catalogs = workbook.Worksheets.Add("Catalogos");
        catalogs.Cell(1, 1).Value = "TipoIdentificacion";
        catalogs.Cell(1, 2).Value = "TipoUnidad";
        catalogs.Cell(1, 3).Value = "EstadoUnidad";
        catalogs.Cell(1, 4).Value = "EstadoPropietario";
        catalogs.Cell(1, 5).Value = "EstadoRelacion";
        catalogs.Cell(1, 6).Value = "SiNo";
        catalogs.Range(1, 1, 1, 6).Style.Font.Bold = true;

        catalogs.Cell(2, 1).Value = "Cédula";
        catalogs.Cell(3, 1).Value = "Pasaporte";
        catalogs.Cell(4, 1).Value = "RUC";
        catalogs.Cell(5, 1).Value = "Otro";

        catalogs.Cell(2, 2).Value = "Apartamento";
        catalogs.Cell(3, 2).Value = "Local";
        catalogs.Cell(4, 2).Value = "Depósito";
        catalogs.Cell(5, 2).Value = "Parqueo";
        catalogs.Cell(6, 2).Value = "Otro";

        catalogs.Cell(2, 3).Value = "Activa";
        catalogs.Cell(3, 3).Value = "Inactiva";

        catalogs.Cell(2, 4).Value = "Borrador";
        catalogs.Cell(3, 4).Value = "Activo";
        catalogs.Cell(4, 4).Value = "Inactivo";

        catalogs.Cell(2, 5).Value = "Activa";
        catalogs.Cell(3, 5).Value = "Inactiva";

        catalogs.Cell(2, 6).Value = "Si";
        catalogs.Cell(3, 6).Value = "No";

        var instructions = workbook.Worksheets.Add("Instrucciones");
        instructions.Cell(1, 1).Value = "Plantilla de importación de padrón — ASAMBLEAS / NEXQUORUM";
        instructions.Cell(2, 1).Value = "Propiedad horizontal: " + (phName ?? string.Empty);
        instructions.Cell(3, 1).Value = "Complete las hojas Unidades, Propietarios y PropietarioUnidad. No cambie los encabezados.";
        instructions.Cell(4, 1).Value = "Coeficiente: porcentaje de la unidad sobre el PH (0–100). La suma de unidades activas debe aproximarse a 100.";
        instructions.Cell(5, 1).Value = "PorcentajePropiedad: participación del propietario sobre la unidad (0–100], por defecto 100 si se omite.";
        instructions.Cell(6, 1).Value = "Correo es obligatorio y único por inquilino. Identificación es opcional.";
        instructions.Cell(7, 1).Value = "Use los valores sugeridos en Catalogos. TipoUnidad admite texto libre si no aparece en la lista.";
        instructions.Cell(8, 1).Value = "Los nuevos propietarios se crean en estado Borrador. No se crean representantes ni poderes desde esta plantilla.";
        instructions.Cell(9, 1).Value = "Máximo 5000 filas en total y archivo de hasta 5 MB. Guarde como .xlsx.";
        instructions.Cell(10, 1).Value = "Si hay una asamblea en check-in o en curso, la importación que cree o actualice unidades/titularidades quedará bloqueada.";

        units.Columns().AdjustToContents();
        owners.Columns().AdjustToContents();
        relations.Columns().AdjustToContents();
        catalogs.Columns().AdjustToContents();
        instructions.Columns().AdjustToContents();

        TryAddListValidation(units, "D2:D5000", catalogs.Range(2, 2, 6, 2));
        TryAddListValidation(units, "F2:F5000", catalogs.Range(2, 3, 3, 3));
        TryAddListValidation(owners, "A2:A5000", catalogs.Range(2, 1, 5, 1));
        TryAddListValidation(owners, "H2:H5000", catalogs.Range(2, 4, 4, 4));
        TryAddListValidation(relations, "E2:E5000", catalogs.Range(2, 5, 3, 5));

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
            sheet.Cell(r, 3).Value = Neutralize(row.Value ?? string.Empty);
            sheet.Cell(r, 4).Value = row.Problem;
            sheet.Cell(r, 5).Value = row.Action;
            r++;
        }

        sheet.Columns().AdjustToContents();
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    public PhRosterWorkbookSheets ParseWorkbookMultiSheet(Stream xlsxStream)
    {
        ArgumentNullException.ThrowIfNull(xlsxStream);
        using var workbook = new XLWorkbook(xlsxStream);

        var unitsSheet = FindSheet(workbook, "Unidades");
        var ownersSheet = FindSheet(workbook, "Propietarios");
        var relationsSheet = FindSheet(workbook, "PropietarioUnidad");

        var isMulti = unitsSheet is not null || ownersSheet is not null || relationsSheet is not null;
        if (!isMulti)
        {
            var (headers, rows) = ParseSheet(workbook.Worksheets.First());
            return new PhRosterWorkbookSheets(
                headers, rows,
                Array.Empty<string>(), Array.Empty<string[]>(),
                Array.Empty<string>(), Array.Empty<string[]>(),
                IsMultiSheet: false);
        }

        var (uh, ur) = unitsSheet is null
            ? ((IReadOnlyList<string>)Array.Empty<string>(), (IReadOnlyList<string[]>)Array.Empty<string[]>())
            : ParseSheet(unitsSheet);
        var (oh, orows) = ownersSheet is null
            ? ((IReadOnlyList<string>)Array.Empty<string>(), (IReadOnlyList<string[]>)Array.Empty<string[]>())
            : ParseSheet(ownersSheet);
        var (rh, rr) = relationsSheet is null
            ? ((IReadOnlyList<string>)Array.Empty<string>(), (IReadOnlyList<string[]>)Array.Empty<string[]>())
            : ParseSheet(relationsSheet);

        return new PhRosterWorkbookSheets(uh, ur, oh, orows, rh, rr, IsMultiSheet: true);
    }

    public (IReadOnlyList<string> Headers, IReadOnlyList<string[]> Rows) ParseWorkbook(Stream xlsxStream)
    {
        ArgumentNullException.ThrowIfNull(xlsxStream);
        using var workbook = new XLWorkbook(xlsxStream);
        var sheet = workbook.Worksheets.FirstOrDefault(w =>
                       w.Name.Equals("Unidades", StringComparison.OrdinalIgnoreCase)
                       || w.Name.Equals("Importacion", StringComparison.OrdinalIgnoreCase))
                   ?? workbook.Worksheets.First();
        return ParseSheet(sheet);
    }

    private static IXLWorksheet? FindSheet(XLWorkbook workbook, string name) =>
        workbook.Worksheets.FirstOrDefault(w => w.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    private static (IReadOnlyList<string> Headers, IReadOnlyList<string[]> Rows) ParseSheet(IXLWorksheet sheet)
    {
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
                var cell = sheet.Cell(r, firstCol + i);
                var raw = cell.GetFormattedString().Trim();
                raw = Neutralize(raw);
                if (raw.Length > 2000)
                {
                    raw = raw[..2000];
                }

                values[i] = raw;
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

    private static string Neutralize(string raw)
    {
        if (raw.Length > 0 && (raw[0] is '=' or '+' or '-' or '@'))
        {
            return "'" + raw;
        }

        return raw;
    }

    private static void WriteHeader(IXLWorksheet sheet, string[] headers)
    {
        for (var i = 0; i < headers.Length; i++)
        {
            sheet.Cell(1, i + 1).Value = headers[i];
            sheet.Cell(1, i + 1).Style.Font.Bold = true;
        }
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
            // Best-effort; Catalogos still documents allowed values.
        }
    }
}
