namespace Asambleas.Infrastructure.Tenancy;

using Asambleas.Application.Abstractions;

/// <summary>
/// Scoped tenant context. Middleware in Web populates setters from claims / HttpContext.
/// </summary>
public sealed class CurrentTenant : ICurrentTenant
{
    public Guid TenantId { get; set; }

    public Guid? OrganizationId { get; set; }

    public Guid? PropertyHorizontalId { get; set; }

    public Guid? UserId { get; set; }

    public bool IsAuthenticated { get; set; }
}
