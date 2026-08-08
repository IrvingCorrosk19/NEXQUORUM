namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class QuorumSnapshot : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public DateTimeOffset TimestampUtc { get; set; } = DateTimeOffset.UtcNow;

    public int PresentUnits { get; set; }

    public decimal PresentCoefficient { get; set; }

    public decimal RequiredCoefficient { get; set; }

    public QuorumStatus Status { get; set; } = QuorumStatus.NotReached;
}
