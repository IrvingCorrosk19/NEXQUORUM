namespace Asambleas.Domain.Voting;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

/// <summary>
/// Simple majority of non-abstention weighted coefficients:
/// Approved when InFavor &gt; Against; otherwise Rejected.
/// Abstention is ignored for the comparison.
/// </summary>
public sealed class SimpleMajorityDecisionRule : IDecisionRule
{
    public const string Code = "SimpleMajority";

    public string RuleCode => Code;

    public MotionStatus Decide(DecisionContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (context.InFavorCoefficient < 0 || context.AgainstCoefficient < 0)
        {
            throw new DomainException(VotingCodes.InvalidChoice, "Vote coefficients must be non-negative.");
        }

        return context.InFavorCoefficient > context.AgainstCoefficient
            ? MotionStatus.Approved
            : MotionStatus.Rejected;
    }

    /// <summary>Test/helper overload.</summary>
    public MotionStatus Decide(
        decimal inFavorCoefficient,
        decimal againstCoefficient,
        decimal abstentionCoefficient) =>
        Decide(new DecisionContext(inFavorCoefficient, againstCoefficient, abstentionCoefficient));
}
