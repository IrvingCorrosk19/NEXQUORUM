namespace Asambleas.Application.Documents;

/// <summary>Shared presentation context for one evidence export (multi-tenant safe).</summary>
public sealed record DocumentExportContext(
    Guid AssemblyId,
    string AssemblyTitle,
    string PropertyHorizontalName,
    string AssemblyStatus,
    string Modality,
    DateTimeOffset ScheduledAtUtc,
    DateTimeOffset GeneratedAtUtc,
    string DocumentId,
    string? ContentHash,
    bool IsSealed)
{
    public string Lifecycle => DocumentLabels.DocumentLifecycle(AssemblyStatus);
    public bool ShowDraftWatermark => DocumentLabels.IsDraftLifecycle(AssemblyStatus);
    public string DocCode(string kind) => $"{kind}-{AssemblyId:N}"[..Math.Min(28, kind.Length + 1 + 32)];
}

public static class DocumentLabelExtras
{
    public static string CalculationMethod(string? method) => method switch
    {
        "Coefficient" or "Power" => "Por coeficiente",
        "Headcount" or "OnePersonOneVote" => "Por cabeza",
        "Unit" => "Por unidad",
        _ => string.IsNullOrWhiteSpace(method) ? "—" : method
    };

    public static string DecisionRule(string? rule) => rule switch
    {
        "SimpleMajority" => "Mayoría simple",
        "AbsoluteMajority" => "Mayoría absoluta",
        "QualifiedMajority" => "Mayoría calificada",
        "Unanimity" => "Unanimidad",
        _ => string.IsNullOrWhiteSpace(rule) ? "—" : rule
    };

    public static string Completeness(string? status) => status switch
    {
        "Complete" or "CompleteEnough" => "Completo",
        "Partial" => "Parcial",
        "Incomplete" => "Incompleto",
        _ => string.IsNullOrWhiteSpace(status) ? "—" : status
    };
}
