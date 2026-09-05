namespace Asambleas.Application.Abstractions;

public interface IMotionImportWorkbookService
{
    byte[] BuildTemplate(
        IReadOnlyList<(string Code, string Title)> agendaItems,
        IReadOnlyList<(string Code, string Label)> ballotKinds,
        IReadOnlyList<(string Code, string Label)> methods,
        IReadOnlyList<(string Code, string Label)> rules,
        IReadOnlyList<(string Code, string Label)> visibility,
        string assemblyLabel);

    (IReadOnlyList<string> Headers, IReadOnlyList<string[]> Rows) ParseWorkbook(Stream xlsxStream);
}