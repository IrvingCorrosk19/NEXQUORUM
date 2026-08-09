namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>Auditable reschedule history. Never mutates prior rows.</summary>
public class AssemblyScheduleChange : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public DateTimeOffset OriginalScheduledAtUtc { get; set; }

    public DateTimeOffset? OriginalEstimatedEndAtUtc { get; set; }

    public DateTimeOffset NewScheduledAtUtc { get; set; }

    public DateTimeOffset? NewEstimatedEndAtUtc { get; set; }

    public string Reason { get; set; } = string.Empty;

    public Guid ChangedByUserId { get; set; }

    public DateTimeOffset ChangedAtUtc { get; set; }

    /// <summary>Pending | Offered | Skipped | Sent</summary>
    public string NotificationStatus { get; set; } = "Pending";

    /// <summary>JSON snapshot of impact analysis at confirm time.</summary>
    public string ImpactJson { get; set; } = "{}";

    public int ScheduleVersionAfter { get; set; }

    public uint? ExpectedRowVersion { get; set; }
}
