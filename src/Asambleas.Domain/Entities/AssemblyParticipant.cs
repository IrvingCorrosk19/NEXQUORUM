namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class AssemblyParticipant : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid UserId { get; set; }

    public Guid? UnitId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string RoleCode { get; set; } = string.Empty;

    public AttendanceStatus AttendanceStatus { get; set; } = AttendanceStatus.Registered;

    public DateTimeOffset? CheckedInAtUtc { get; set; }

    /// <summary>Platform verified identity + representation for this assembly (≠ login, ≠ SignalR).</summary>
    public bool IsAccredited { get; set; }

    public DateTimeOffset? AccreditedAtUtc { get; set; }

    public Guid? AccreditedByUserId { get; set; }

    /// <summary>Sum of active AssemblyRepresentation snapshots at accreditation.</summary>
    public decimal EffectiveCoefficientPercent { get; set; }

    public PresenceType? PresenceType { get; set; }
}
