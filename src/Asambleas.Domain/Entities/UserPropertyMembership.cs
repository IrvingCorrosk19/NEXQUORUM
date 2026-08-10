namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Links a portal user to a property horizontal within a tenant (multi-PH support).
/// </summary>
public class UserPropertyMembership : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid UserId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public string RoleHint { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;
}
