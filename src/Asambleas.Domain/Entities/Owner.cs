namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class Owner : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public Guid? UserId { get; set; }
}
