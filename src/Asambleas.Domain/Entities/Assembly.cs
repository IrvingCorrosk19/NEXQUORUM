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

    public decimal RequiredQuorumPercent { get; set; }

    public Guid? ActiveAgendaItemId { get; set; }

    /// <summary>
    /// Maps to PostgreSQL <c>xmin</c> via EF <c>IsRowVersion()</c> for optimistic concurrency.
    /// </summary>
    public uint RowVersion { get; set; }
}
