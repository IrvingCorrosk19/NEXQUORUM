namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class PortalNotification : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public Guid? UserId { get; set; }

    public Guid? OwnerId { get; set; }

    public Guid? ConvocationId { get; set; }

    public Guid? DeliveryId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;

    public bool IsRead { get; set; }

    public DateTimeOffset? ReadAtUtc { get; set; }
}
