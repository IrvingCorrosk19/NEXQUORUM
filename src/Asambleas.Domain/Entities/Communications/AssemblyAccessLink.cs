namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Opaque hashed access link for assembly join from convocation email.
/// Never stores the raw token. Does not grant voting rights by itself.
/// </summary>
public class AssemblyAccessLink : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid ConvocationId { get; set; }

    public Guid RecipientId { get; set; }

    public Guid? OwnerId { get; set; }

    public Guid? UserId { get; set; }

    public Guid? DeliveryId { get; set; }

    /// <summary>SHA-256 hex of the opaque token emailed to the recipient.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset ExpiresAtUtc { get; set; }

    public DateTimeOffset? RevokedAtUtc { get; set; }

    public DateTimeOffset? LastUsedAtUtc { get; set; }

    public string Purpose { get; set; } = "ConvocationJoin";
}
