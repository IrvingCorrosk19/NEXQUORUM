namespace Asambleas.Domain.Voting;

/// <summary>
/// Resolves the decision rule frozen on a voting session (historical snapshot).
/// </summary>
public sealed class DecisionRuleResolver
{
    private readonly IReadOnlyDictionary<string, IDecisionRule> _byCode;
    private readonly IDecisionRule _fallback;

    public DecisionRuleResolver(IEnumerable<IDecisionRule> rules)
    {
        var list = rules.ToList();
        if (list.Count == 0)
        {
            throw new InvalidOperationException("At least one IDecisionRule must be registered.");
        }

        _byCode = list.ToDictionary(r => r.RuleCode, StringComparer.OrdinalIgnoreCase);
        _fallback = list.FirstOrDefault(r => r.RuleCode == SimpleMajorityDecisionRule.Code) ?? list[0];
    }

    public IDecisionRule Resolve(string? ruleCode)
    {
        if (!string.IsNullOrWhiteSpace(ruleCode)
            && _byCode.TryGetValue(ruleCode.Trim(), out var rule))
        {
            return rule;
        }

        return _fallback;
    }
}
