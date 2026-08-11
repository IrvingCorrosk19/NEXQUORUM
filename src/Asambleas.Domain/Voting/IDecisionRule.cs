namespace Asambleas.Domain.Voting;

using Asambleas.Domain.Enums;

public interface IDecisionRule
{
    /// <summary>Stable rule identifier persisted on open/close for historical explainability.</summary>
    string RuleCode { get; }

    MotionStatus Decide(DecisionContext context);
}
