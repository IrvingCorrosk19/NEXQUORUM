namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class CommunicationBatch : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid ConvocationId { get; set; }

    public string IdempotencyKey { get; set; } = string.Empty;

    public ConvocationStatus Status { get; set; } = ConvocationStatus.Sending;

    public int TotalCount { get; set; }

    public int SentCount { get; set; }

    public int DeliveredCount { get; set; }

    public int FailedCount { get; set; }

    public int SkippedCount { get; set; }

    public DateTimeOffset? StartedAtUtc { get; set; }

    public DateTimeOffset? CompletedAtUtc { get; set; }
}
