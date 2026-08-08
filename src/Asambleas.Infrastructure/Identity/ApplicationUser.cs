namespace Asambleas.Infrastructure.Identity;

using Microsoft.AspNetCore.Identity;

public class ApplicationUser : IdentityUser<Guid>
{
    public Guid TenantId { get; set; }

    public Guid? OrganizationId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string DemoRole { get; set; } = string.Empty;
}
