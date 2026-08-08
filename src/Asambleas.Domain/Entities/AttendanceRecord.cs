namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class AttendanceRecord : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid UserId { get; set; }

    public Guid? UnitId { get; set; }

    public PresenceType PresenceType { get; set; } = PresenceType.Virtual;

    public AttendanceStatus Status { get; set; } = AttendanceStatus.Registered;

    public DateTimeOffset TimestampUtc { get; set; } = DateTimeOffset.UtcNow;
}
