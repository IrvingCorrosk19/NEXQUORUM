namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class Owner : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string? FirstName { get; set; }

    public string? LastName { get; set; }

    public string? IdentificationType { get; set; }

    public string? Identification { get; set; }

    public string Email { get; set; } = string.Empty;

    public string? Phone { get; set; }

    public OwnerLifecycleStatus Status { get; set; } = OwnerLifecycleStatus.Draft;

    public Guid? UserId { get; set; }
}
