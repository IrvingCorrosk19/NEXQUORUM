using Asambleas.Domain.Common;
using Asambleas.Domain.Quorum;
using FluentAssertions;

namespace Asambleas.UnitTests.Quorum;

public sealed class QuorumEngineTests
{
    /// <summary>
    /// Demo Ocean units: 14×6 + 8×2 = 100 (DemoSeedConstants; EO-001 "14*6+8*8" shorthand = two 8% units).
    /// </summary>
    private static readonly decimal[] OceanEligible =
    [
        14m, 14m, 14m, 14m, 14m, 14m, 8m, 8m
    ];

    [Fact]
    public void Eligible_ocean_coefficients_sum_to_100()
    {
        const decimal explicitSum = (14m * 6m) + (8m * 2m);
        explicitSum.Should().Be(100m);
        OceanEligible.Sum().Should().Be(100m);
    }

    [Fact]
    public void Quorum_reached_when_present_meets_required_percent()
    {
        // 4×14 = 56 >= 50
        var present = new[] { 14m, 14m, 14m, 14m };

        var result = QuorumEngine.Calculate(OceanEligible, present, requiredPercent: 50m);

        result.CurrentCoefficient.Should().Be(56m);
        result.RequiredCoefficient.Should().Be(50m);
        result.QuorumReached.Should().BeTrue();
        result.PresentUnits.Should().Be(4);
    }

    [Fact]
    public void Quorum_not_reached_when_present_below_required_percent()
    {
        // 3×14 = 42 < 50
        var present = new[] { 14m, 14m, 14m };

        var result = QuorumEngine.Calculate(OceanEligible, present, requiredPercent: 50m);

        result.CurrentCoefficient.Should().Be(42m);
        result.RequiredCoefficient.Should().Be(50m);
        result.QuorumReached.Should().BeFalse();
        result.PresentUnits.Should().Be(3);
    }

    [Fact]
    public void Quorum_reached_exactly_at_threshold()
    {
        // 14*3 + 8 = 50 exactly
        var present = new[] { 14m, 14m, 14m, 8m };

        var result = QuorumEngine.Calculate(OceanEligible, present, requiredPercent: 50m);

        result.CurrentCoefficient.Should().Be(50m);
        result.RequiredCoefficient.Should().Be(50m);
        result.QuorumReached.Should().BeTrue();
    }

    [Fact]
    public void Calculate_rejects_invalid_required_percent()
    {
        var act = () => QuorumEngine.Calculate([10m], [10m], requiredPercent: 101m);

        act.Should().Throw<DomainException>()
            .WithMessage("*between 0 and 100*");
    }

    [Fact]
    public void Calculate_rejects_negative_coefficients()
    {
        var act = () => QuorumEngine.Calculate([-1m], [0m], requiredPercent: 50m);

        act.Should().Throw<DomainException>()
            .WithMessage("*non-negative*");
    }
}
