using Asambleas.Application.Quorum;
using Asambleas.Domain.Quorum;
using FluentAssertions;

namespace Asambleas.UnitTests.Quorum;

public sealed class CoefficientConfigurationDiagnosticsTests
{
    [Fact]
    public void Studio_style_total_381_at_50_percent_explains_190_50_required_points()
    {
        var eligible = Enumerable.Repeat(1m, 381).ToArray();
        var result = QuorumEngine.Calculate(eligible, presentUnitCoefficients: [10m], requiredPercent: 50m);

        result.EligibleCoefficientTotal.Should().Be(381m);
        result.RequiredCoefficient.Should().Be(190.5m);
        result.CurrentCoefficient.Should().Be(10m);

        var (invalid, message) = QuorumService.DiagnoseCoefficientConfiguration(381m, 50m);
        invalid.Should().BeTrue();
        message.Should().Contain("381");
    }

    [Fact]
    public void Normalized_ph_at_100_is_valid()
    {
        var (invalid, _) = QuorumService.DiagnoseCoefficientConfiguration(100m, 50m);
        invalid.Should().BeFalse();

        var result = QuorumEngine.Calculate([14m, 14m, 14m, 14m, 14m, 14m, 8m, 8m], [14m], 50m);
        result.EligibleCoefficientTotal.Should().Be(100m);
        result.RequiredCoefficient.Should().Be(50m);
    }

    [Theory]
    [InlineData(99.99)]
    [InlineData(100.01)]
    [InlineData(381)]
    [InlineData(-1)]
    public void Near_and_invalid_totals_are_flagged(decimal total)
    {
        var (invalid, message) = QuorumService.DiagnoseCoefficientConfiguration(total, 50m);
        invalid.Should().BeTrue();
        message.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public void Exact_100_within_documented_tolerance_is_valid()
    {
        QuorumService.DiagnoseCoefficientConfiguration(100.0000m, 50m).Invalid.Should().BeFalse();
        // Tolerance 0.0001 after Normalize(scale=4)
        QuorumService.DiagnoseCoefficientConfiguration(100.0001m, 50m).Invalid.Should().BeFalse();
    }

    [Fact]
    public void Required_percent_over_100_is_invalid()
    {
        var (invalid, message) = QuorumService.DiagnoseCoefficientConfiguration(100m, 150m);
        invalid.Should().BeTrue();
        message.Should().Contain("0");
        message.Should().Contain("100");
    }
}