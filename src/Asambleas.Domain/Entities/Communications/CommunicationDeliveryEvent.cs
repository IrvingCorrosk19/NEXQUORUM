namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class CommunicationDeliveryEvent : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid DeliveryId { get; set; }

    public DeliveryStatus Status { get; set; }

    public string EventType { get; set; } = string.Empty;

    public string? Detail { get; set; }

    public DateTimeOffset OccurredAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public string? ProviderPayloadJson { get; set; }
}
