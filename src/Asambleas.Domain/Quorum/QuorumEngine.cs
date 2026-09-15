namespace Asambleas.Domain.Quorum;

using Asambleas.Domain.Common;

/// <summary>
/// Coefficient-based quorum engine. Required coefficient = eligible total × (requiredPercent / 100).
/// </summary>
public static class QuorumEngine
{
    public static QuorumCalculationResult Calculate(
        IEnumerable<decimal> eligibleUnitCoefficients,
        IEnumerable<decimal> presentUnitCoefficients,
        decimal requiredPercent)
    {
        if (requiredPercent < 0 || requiredPercent > 100)
        {
            throw new DomainException(
                $"Required quorum percent must be between 0 and 100 inclusive. Got: {requiredPercent}.");
        }

        var eligible = eligibleUnitCoefficients?.ToArray() ?? [];
        var present = presentUnitCoefficients?.ToArray() ?? [];

        if (eligible.Any(c => c < 0))
        {
            throw new DomainException("Eligible unit coefficients must be non-negative.");
        }

        if (present.Any(c => c < 0))
        {
            throw new DomainException("Present unit coefficients must be non-negative.");
        }

        var eligibleTotal = Math.Round(eligible.Sum(), 4, MidpointRounding.AwayFromZero);
        // Present coeffs must already be unique per unit; still never exceed the eligible padón.
        var rawPresent = Math.Round(present.Sum(), 4, MidpointRounding.AwayFromZero);
        var currentCoefficient = eligibleTotal > 0 && rawPresent > eligibleTotal
            ? eligibleTotal
            : rawPresent;
        // Defense when padón is complete (~100): display never exceeds 100.00 coefficient points.
        if (eligibleTotal >= 99.99m && eligibleTotal <= 100.01m && currentCoefficient > 100m)
        {
            currentCoefficient = 100m;
        }

        var requiredCoefficient = Math.Round(
            eligibleTotal * (requiredPercent / 100m),
            4,
            MidpointRounding.AwayFromZero);

        return new QuorumCalculationResult(
            CurrentCoefficient: currentCoefficient,
            RequiredCoefficient: requiredCoefficient,
            QuorumReached: currentCoefficient >= requiredCoefficient,
            PresentUnits: present.Length,
            EligibleCoefficientTotal: eligibleTotal);
    }
}
