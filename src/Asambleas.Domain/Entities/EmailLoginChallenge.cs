namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Single-use email login OTP (6 digits). Stores only a hash — never the plaintext code.
/// </summary>
public class EmailLoginChallenge : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid? PropertyHorizontalId { get; set; }

    public Guid? AssemblyId { get; set; }

    public string EmailNormalized { get; set; } = string.Empty;

    /// <summary>SHA-256 hex of pepper:email:code.</summary>
    public string CodeHash { get; set; } = string.Empty;

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? ConsumedAtUtc { get; set; }

    public int AttemptCount { get; set; }

    public DateTimeOffset LastSentAtUtc { get; set; }

    /// <summary>Safe relative return path captured at request time.</summary>
    public string? ReturnUrl { get; set; }

    /// <summary>SHA-256 of request IP (for rate/audit — not reversible identity).</summary>
    public string? RequestIpHash { get; set; }
}
