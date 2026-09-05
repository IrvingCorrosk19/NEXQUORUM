namespace Asambleas.Application.Abstractions;

/// <summary>
/// Spreadsheet template/error export and multi-sheet roster parsing (ClosedXML in Infrastructure).
/// </summary>
public interface IPhImportWorkbookService
{
    byte[] BuildTemplate(string phName);

    byte[] BuildErrorReport(IReadOnlyList<(int Row, string Field, string? Value, string Problem, string Action)> rows);

    /// <summary>
    /// Parses multi-sheet roster workbook (Unidades / Propietarios / PropietarioUnidad).
    /// Unknown or missing sheets yield empty row lists.
    /// </summary>
    PhRosterWorkbookSheets ParseWorkbookMultiSheet(Stream xlsxStream);

    /// <summary>
    /// Legacy single-sheet / first-sheet flat parse for backward compatibility.
    /// </summary>
    (IReadOnlyList<string> Headers, IReadOnlyList<string[]> Rows) ParseWorkbook(Stream xlsxStream);
}

public sealed record PhRosterWorkbookSheets(
    IReadOnlyList<string> UnitHeaders,
    IReadOnlyList<string[]> UnitRows,
    IReadOnlyList<string> OwnerHeaders,
    IReadOnlyList<string[]> OwnerRows,
    IReadOnlyList<string> RelationHeaders,
    IReadOnlyList<string[]> RelationRows,
    bool IsMultiSheet);
