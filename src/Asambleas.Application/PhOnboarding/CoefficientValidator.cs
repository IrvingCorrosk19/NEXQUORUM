using System.Globalization;

namespace Asambleas.Application.PhOnboarding;

/// <summary>
/// Server-side coefficient arithmetic with fixed 4-decimal scale (matches Unit.CoefficientPercent).
/// Avoids naive floating-point equality checks.
/// Delta is expected minus total: positive means short, negative means over.
/// This rollup is the property coefficient total, not assembly quorum.
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

    /// <summary>Same wording and scale the units screen must show. Does not change stored coefficients.</summary>
    public static string DescribeRollup(decimal totalPercent)
    {
        var total = Normalize(totalPercent);
        var totalText = FormatAmount(total);
        if (IsComplete(total))
        {
            return $"Total de coeficientes completo: {totalText} %.";
        }

        var delta = Delta(total);
        var gap = FormatAmount(Math.Abs(delta));
        return delta > 0
            ? $"Total de coeficientes: {totalText} %. Falta {gap} %."
            : $"Total de coeficientes: {totalText} %. Excede {gap} %.";
    }

    public static string FormatAmount(decimal value)
    {
        var rounded = Normalize(value);
        return rounded.ToString("0.####", CultureInfo.InvariantCulture);
    }
}
