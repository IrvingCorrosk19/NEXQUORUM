namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class Organization : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Code { get; set; } = string.Empty;
}
