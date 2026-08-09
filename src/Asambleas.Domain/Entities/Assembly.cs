namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class Assembly : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public const string ModalityVirtual = "VIRTUAL";

    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string Modality { get; set; } = ModalityVirtual;

    public AssemblyStatus Status { get; set; } = AssemblyStatus.Draft;

    public DateTimeOffset ScheduledAtUtc { get; set; }

    /// <summary>Optional estimated end; used for ICS, conflicts, and calendar span.</summary>
    public DateTimeOffset? EstimatedEndAtUtc { get; set; }

    /// <summary>ORDINARY | EXTRAORDINARY | OTHER — display taxonomy, not lifecycle status.</summary>
    public string AssemblyKind { get; set; } = "ORDINARY";

    /// <summary>Physical / hybrid venue text. Virtual assemblies may leave empty.</summary>
    public string? LocationText { get; set; }

    public string? Notes { get; set; }

    /// <summary>Lobby/join opens this many minutes before <see cref="ScheduledAtUtc"/>.</summary>
    public int JoinWindowMinutesBefore { get; set; } = 30;

    /// <summary>Increments on each auditable reschedule; reminder jobs bind to this version.</summary>
    public int ScheduleVersion { get; set; } = 1;

    public string? CancelReason { get; set; }

    public DateTimeOffset? CancelledAtUtc { get; set; }

    public Guid? CancelledByUserId { get; set; }

    public decimal RequiredQuorumPercent { get; set; }

    public Guid? ActiveAgendaItemId { get; set; }

    /// <summary>
    /// Maps to PostgreSQL <c>xmin</c> via EF <c>IsRowVersion()</c> for optimistic concurrency.
    /// </summary>
    public uint RowVersion { get; set; }

    public DateTimeOffset ResolveEstimatedEndAtUtc() =>
        EstimatedEndAtUtc ?? ScheduledAtUtc.AddHours(2);
}
