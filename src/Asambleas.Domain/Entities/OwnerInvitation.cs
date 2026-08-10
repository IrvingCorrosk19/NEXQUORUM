namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Secure single-use invitation for portal activation. Never stores plaintext passwords.
/// </summary>
public class OwnerInvitation : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public Guid OwnerId { get; set; }

    public string Email { get; set; } = string.Empty;

    /// <summary>SHA-256 hex of the opaque token sent to the user.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? ConsumedAtUtc { get; set; }

    public Guid? CreatedByUserId { get; set; }

    public Guid? ConsumedByUserId { get; set; }
}
