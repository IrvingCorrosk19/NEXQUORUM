namespace Asambleas.Domain.Voting;

using Asambleas.Domain.Enums;

public static class ResultVisibility
{
    public const string HiddenUntilClose = nameof(ResultVisibilityPolicy.HiddenUntilClose);
    public const string PresidentOnlyLive = nameof(ResultVisibilityPolicy.PresidentOnlyLive);
    public const string LiveResults = nameof(ResultVisibilityPolicy.LiveResults);

    public static ResultVisibilityPolicy Parse(string? value, bool hidePartialResultsFallback = true)
    {
        if (!string.IsNullOrWhiteSpace(value)
            && Enum.TryParse<ResultVisibilityPolicy>(value.Trim(), ignoreCase: true, out var parsed))
        {
            return parsed;
        }

        return hidePartialResultsFallback
            ? ResultVisibilityPolicy.HiddenUntilClose
            : ResultVisibilityPolicy.LiveResults;
    }

    public static string ToWire(ResultVisibilityPolicy policy) => policy.ToString();

    /// <summary>Legacy bool: true when trend is not broadcast to the full assembly.</summary>
    public static bool HidesPublicTrend(ResultVisibilityPolicy policy) =>
        policy is not ResultVisibilityPolicy.LiveResults;

    public static bool AllowsLiveTrendForAudience(
        ResultVisibilityPolicy policy,
        bool isOperatorResultsViewer)
    {
        return policy switch
        {
            ResultVisibilityPolicy.LiveResults => true,
            ResultVisibilityPolicy.PresidentOnlyLive => isOperatorResultsViewer,
            _ => false
        };
    }
}
