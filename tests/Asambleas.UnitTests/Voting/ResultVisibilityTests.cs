using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
using FluentAssertions;

namespace Asambleas.UnitTests.Voting;

public sealed class ResultVisibilityTests
{
    [Theory]
    [InlineData(null, true, ResultVisibilityPolicy.HiddenUntilClose)]
    [InlineData(null, false, ResultVisibilityPolicy.LiveResults)]
    [InlineData("PresidentOnlyLive", true, ResultVisibilityPolicy.PresidentOnlyLive)]
    [InlineData("LiveResults", true, ResultVisibilityPolicy.LiveResults)]
    public void Parse_resolves_policy(string? wire, bool hideFallback, ResultVisibilityPolicy expected)
    {
        ResultVisibility.Parse(wire, hideFallback).Should().Be(expected);
    }

    [Theory]
    [InlineData(ResultVisibilityPolicy.HiddenUntilClose, false, false)]
    [InlineData(ResultVisibilityPolicy.HiddenUntilClose, true, false)]
    [InlineData(ResultVisibilityPolicy.PresidentOnlyLive, false, false)]
    [InlineData(ResultVisibilityPolicy.PresidentOnlyLive, true, true)]
    [InlineData(ResultVisibilityPolicy.LiveResults, false, true)]
    [InlineData(ResultVisibilityPolicy.LiveResults, true, true)]
    public void AllowsLiveTrendForAudience_matches_matrix(
        ResultVisibilityPolicy policy,
        bool isOperator,
        bool expected)
    {
        ResultVisibility.AllowsLiveTrendForAudience(policy, isOperator).Should().Be(expected);
    }
}

public sealed class CoefficientTallyMathTests
{
    /// <summary>
    /// Dataset A=10 B=15 C=20 D=12 E=18 F=25 (total 100).
    /// Votes: A,B,C InFavor (45); D,E Against (30); F Abstention (25).
    /// SimpleMajority: 45 > 30 → Approved.
    /// </summary>
    [Fact]
    public void Weighted_combination_matches_hand_calculation()
    {
        var votes = new (string Choice, decimal Coeff)[]
        {
            ("InFavor", 10m),
            ("InFavor", 15m),
            ("InFavor", 20m),
            ("Against", 12m),
            ("Against", 18m),
            ("Abstention", 25m)
        };

        var inFavor = votes.Where(v => v.Choice == "InFavor").Sum(v => v.Coeff);
        var against = votes.Where(v => v.Choice == "Against").Sum(v => v.Coeff);
        var abstention = votes.Where(v => v.Choice == "Abstention").Sum(v => v.Coeff);

        inFavor.Should().Be(45m);
        against.Should().Be(30m);
        abstention.Should().Be(25m);
        (inFavor + against + abstention).Should().Be(100m);

        var rule = new SimpleMajorityDecisionRule();
        rule.Decide(inFavor, against, abstention).Should().Be(MotionStatus.Approved);
    }
}
