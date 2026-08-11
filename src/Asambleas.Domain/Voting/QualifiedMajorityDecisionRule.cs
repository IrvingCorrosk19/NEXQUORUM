namespace Asambleas.Domain.Voting;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

/// <summary>
/// Qualified / percentage majority: Approved when InFavor coefficient
/// is greater than or equal to <see cref="DecisionContext.RequiredThresholdPercent"/>.
/// Example: Favor 63% with threshold 66.67% → Rejected.
/// </summary>
public sealed class QualifiedMajorityDecisionRule : IDecisionRule
{
    public const string Code = "QualifiedMajority";

    public string RuleCode => Code;

    public MotionStatus Decide(DecisionContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (context.InFavorCoefficient < 0 || context.AgainstCoefficient < 0)
        {
            throw new DomainException(VotingCodes.InvalidChoice, "Vote coefficients must be non-negative.");
        }

        if (context.RequiredThresholdPercent is null)
        {
            throw new DomainException(
                VotingCodes.InvalidChoice,
                "Qualified majority requires a configured threshold percentage.");
        }

        var threshold = Math.Round(context.RequiredThresholdPercent.Value, 4, MidpointRounding.AwayFromZero);
        var inFavor = Math.Round(context.InFavorCoefficient, 4, MidpointRounding.AwayFromZero);

        return inFavor >= threshold
            ? MotionStatus.Approved
            : MotionStatus.Rejected;
    }
}
