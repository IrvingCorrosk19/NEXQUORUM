namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class Tenant : Entity
{
    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
}
