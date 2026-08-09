namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class CommunicationDelivery : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid BatchId { get; set; }

    public Guid ConvocationId { get; set; }

    public Guid RecipientId { get; set; }

    public CommunicationChannel Channel { get; set; }

    public CommunicationProviderType ProviderType { get; set; }

    public DeliveryStatus Status { get; set; } = DeliveryStatus.Pending;

    public string? Destination { get; set; }

    public bool WasRedirectedToTestOverride { get; set; }

    public string? ProviderMessageId { get; set; }

    public string? ErrorDetail { get; set; }

    public int AttemptCount { get; set; }

    public DateTimeOffset? QueuedAtUtc { get; set; }

    public DateTimeOffset? SentAtUtc { get; set; }

    public DateTimeOffset? DeliveredAtUtc { get; set; }

    public DateTimeOffset? ReadAtUtc { get; set; }

    public DateTimeOffset? NextRetryAtUtc { get; set; }
}
