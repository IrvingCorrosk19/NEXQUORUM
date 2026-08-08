namespace Asambleas.Domain.Voting;

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

    public MotionStatus Decide(
        decimal inFavorCoefficient,
        decimal againstCoefficient,
        decimal abstentionCoefficient)
    {
        _ = abstentionCoefficient;

        if (inFavorCoefficient < 0 || againstCoefficient < 0)
        {
            throw new Common.DomainException(VotingCodes.InvalidChoice, "Vote coefficients must be non-negative.");
        }

        return inFavorCoefficient > againstCoefficient
            ? MotionStatus.Approved
            : MotionStatus.Rejected;
    }
}
