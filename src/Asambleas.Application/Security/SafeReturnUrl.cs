namespace Asambleas.Application.Security;

/// <summary>Open-redirect guard for post-login / OAuth return URLs.</summary>
public static class SafeReturnUrl
{
    public static string? Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var value = raw.Trim();
        if (!value.StartsWith('/') || value.StartsWith("//", StringComparison.Ordinal))
        {
            return null;
        }

        if (value.Contains("://", StringComparison.Ordinal)
            || value.Contains('\\')
            || value.Contains('\r')
            || value.Contains('\n')
            || value.Contains('\0'))
        {
            return null;
        }

        if (value.StartsWith("/\\", StringComparison.Ordinal)
            || value.Contains("javascript:", StringComparison.OrdinalIgnoreCase)
            || value.Contains("data:", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return value.Length > 2048 ? value[..2048] : value;
    }
}
