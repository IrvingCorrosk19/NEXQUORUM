namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Concrete reminder fire times bound to an assembly schedule version.
/// Reschedule cancels Pending rows for the previous version and recreates them.
/// </summary>
public class AssemblyReminderOccurrence : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid? ReminderRuleId { get; set; }

    public int OffsetHoursBeforeAssembly { get; set; }

    public DateTimeOffset FireAtUtc { get; set; }

    public int ScheduleVersion { get; set; }

    /// <summary>Pending | Sent | Cancelled</summary>
    public string Status { get; set; } = "Pending";

    public string ChannelsJson { get; set; } = "[]";

    public DateTimeOffset? CancelledAtUtc { get; set; }

    public string? CancelReason { get; set; }
}
