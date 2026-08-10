namespace Asambleas.Application.PhOnboarding;

/// <summary>
/// Server-side coefficient arithmetic with fixed 4-decimal scale (matches Unit.CoefficientPercent).
/// Avoids naive floating-point equality checks.
/// </summary>
public static class CoefficientValidator
{
    public const decimal ExpectedTotal = 100m;
    public const decimal Tolerance = 0.0001m;
    public const int Scale = 4;

    public static decimal Normalize(decimal value) =>
        Math.Round(value, Scale, MidpointRounding.AwayFromZero);

    public static bool IsComplete(decimal totalPercent)
    {
        var total = Normalize(totalPercent);
        return Math.Abs(total - ExpectedTotal) <= Tolerance;
    }

    public static decimal Delta(decimal totalPercent) =>
        Normalize(ExpectedTotal - Normalize(totalPercent));
}
