using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
using FluentAssertions;

namespace Asambleas.UnitTests.Voting;

public sealed class SimpleMajorityDecisionRuleTests
{
    private readonly SimpleMajorityDecisionRule _rule = new();

    [Fact]
    public void Approves_when_in_favor_exceeds_against()
    {
        _rule.Decide(56m, 28m, abstentionCoefficient: 16m)
            .Should().Be(MotionStatus.Approved);
    }

    [Fact]
    public void Rejects_when_against_equals_in_favor()
    {
        _rule.Decide(42m, 42m, abstentionCoefficient: 16m)
            .Should().Be(MotionStatus.Rejected);
    }

    [Fact]
    public void Rejects_when_against_exceeds_in_favor()
    {
        _rule.Decide(14m, 70m, abstentionCoefficient: 0m)
            .Should().Be(MotionStatus.Rejected);
    }

    [Fact]
    public void Abstention_does_not_affect_decision()
    {
        var withoutAbstention = _rule.Decide(30m, 20m, 0m);
        var withAbstention = _rule.Decide(30m, 20m, 50m);

        withoutAbstention.Should().Be(MotionStatus.Approved);
        withAbstention.Should().Be(MotionStatus.Approved);
    }

    [Fact]
    public void Negative_coefficients_throw()
    {
        var act = () => _rule.Decide(-1m, 0m, 0m);

        act.Should().Throw<DomainException>()
            .WithMessage("*non-negative*");
    }
}
