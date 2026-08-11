using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
using FluentAssertions;

namespace Asambleas.UnitTests.Voting;

public sealed class QualifiedMajorityDecisionRuleTests
{
    private readonly QualifiedMajorityDecisionRule _rule = new();

    [Fact]
    public void Spec_example_63_vs_66_67_is_rejected()
    {
        // A+B+C = 63 favor, D+F = 25 against, E = 12 abstain; threshold 66.67
        var decision = _rule.Decide(new DecisionContext(
            InFavorCoefficient: 63m,
            AgainstCoefficient: 25m,
            AbstentionCoefficient: 12m,
            RequiredThresholdPercent: 66.67m,
            EligibleCoefficient: 100m));

        decision.Should().Be(MotionStatus.Rejected);
    }

    [Fact]
    public void Approves_when_in_favor_meets_threshold()
    {
        _rule.Decide(new DecisionContext(66.67m, 20m, 13.33m, 66.67m))
            .Should().Be(MotionStatus.Approved);
    }

    [Fact]
    public void Rejects_when_just_under_threshold()
    {
        _rule.Decide(new DecisionContext(66.66m, 20m, 13.34m, 66.67m))
            .Should().Be(MotionStatus.Rejected);
    }
}
