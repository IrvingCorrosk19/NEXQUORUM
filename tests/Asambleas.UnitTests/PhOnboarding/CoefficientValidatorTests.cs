using Asambleas.Application.PhOnboarding;

namespace Asambleas.UnitTests.PhOnboarding;

public sealed class CoefficientValidatorTests
{
    [Fact]
    public void IsComplete_accepts_exact_100()
    {
        Assert.True(CoefficientValidator.IsComplete(100m));
        Assert.True(CoefficientValidator.IsComplete(100.0000m));
    }

    [Fact]
    public void IsComplete_rejects_naive_float_drift_beyond_tolerance()
    {
        Assert.False(CoefficientValidator.IsComplete(99.9998m));
        Assert.True(CoefficientValidator.IsComplete(99.99995m));
    }

    [Fact]
    public void Delta_reports_missing_and_excess()
    {
        Assert.Equal(0.4279m, CoefficientValidator.Delta(99.5721m));
        Assert.Equal(-0.0100m, CoefficientValidator.Delta(100.0100m));
    }

    [Fact]
    public void Normalize_uses_four_decimal_scale()
    {
        Assert.Equal(0.4231m, CoefficientValidator.Normalize(0.42314m));
    }
}
