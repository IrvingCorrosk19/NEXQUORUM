namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Single-use password reset for an owner portal account. Never stores plaintext passwords.
/// </summary>
public class OwnerPasswordReset : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public Guid UserId { get; set; }

    public Guid OwnerId { get; set; }

    public string Email { get; set; } = string.Empty;

    /// <summary>SHA-256 hex of the opaque token sent to the user.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? ConsumedAtUtc { get; set; }

    /// <summary>Null when the owner requested reset from the login page.</summary>
    public Guid? CreatedByUserId { get; set; }

    public Guid? ConsumedByUserId { get; set; }
}
