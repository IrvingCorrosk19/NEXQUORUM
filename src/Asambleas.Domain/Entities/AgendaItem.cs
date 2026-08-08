namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class AgendaItem : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public int Ordinal { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public bool IsActive { get; set; }
}
