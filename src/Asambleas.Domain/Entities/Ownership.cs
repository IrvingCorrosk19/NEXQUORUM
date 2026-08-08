namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class Ownership : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid UnitId { get; set; }

    public Guid OwnerId { get; set; }

    public decimal SharePercent { get; set; }
}
