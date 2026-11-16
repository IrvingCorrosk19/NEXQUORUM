namespace Asambleas.Application.Communications;

using System.Security.Cryptography;
using System.Text;

/// <summary>
/// Keeps communication idempotency keys within the 128-character column limit.
/// Client keys that embed assembly id + title + recipient GUIDs overflow varchar(128)
/// and previously caused Postgres 22001 on INSERT.
/// </summary>
public static class IdempotencyKeyNormalizer
{
    public const int MaxLength = 128;

    public static string? Normalize(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        var trimmed = key.Trim();
        if (trimmed.Length <= MaxLength)
        {
            return trimmed;
        }

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(trimmed))).ToLowerInvariant();
        return $"sha256:{hash}";
    }

    public static string Require(string? key, string fallback)
    {
        var normalized = Normalize(string.IsNullOrWhiteSpace(key) ? fallback : key);
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            return normalized;
        }

        return Normalize(fallback) ?? "idemp";
    }
}
