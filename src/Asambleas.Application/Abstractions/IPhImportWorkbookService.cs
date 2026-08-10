namespace Asambleas.Application.Abstractions;

/// <summary>
/// Spreadsheet template/error export (ClosedXML in Infrastructure).
/// </summary>
public interface IPhImportWorkbookService
{
    byte[] BuildTemplate();

    byte[] BuildErrorReport(IReadOnlyList<(int Row, string Field, string? Value, string Problem, string Action)> rows);

    (IReadOnlyList<string> Headers, IReadOnlyList<string[]> Rows) ParseWorkbook(Stream xlsxStream);
}
