namespace Asambleas.Web.Security;

using System.Security.Claims;
using Asambleas.Application.Security;
using Asambleas.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

/// <summary>
/// RolePermissionMap is the sole source of permission claims.
/// Persisted AspNetUserClaims / AspNetRoleClaims permissions are stripped so
/// stale seed data cannot elevate privileges after the map is tightened.
/// </summary>
public sealed class AsambleasUserClaimsPrincipalFactory
    : UserClaimsPrincipalFactory<ApplicationUser, ApplicationRole>
{
    public AsambleasUserClaimsPrincipalFactory(
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        IOptions<IdentityOptions> options)
        : base(userManager, roleManager, options)
    {
    }

    public override async Task<ClaimsPrincipal> CreateAsync(ApplicationUser user)
    {
        var principal = await base.CreateAsync(user);
        if (principal.Identity is not ClaimsIdentity identity)
        {
            return principal;
        }

        // Security-stamp validation rebuilds the principal from this factory and drops
        // claims that login attached only through SignInWithClaimsAsync.
        EnsureSingleClaim(identity, AsambleasClaimTypes.TenantId, user.TenantId.ToString("D"));
        EnsureSingleClaim(
            identity,
            AsambleasClaimTypes.OrganizationId,
            user.OrganizationId?.ToString("D"));
        EnsureSingleClaim(
            identity,
            AsambleasClaimTypes.DisplayName,
            string.IsNullOrWhiteSpace(user.DisplayName) ? null : user.DisplayName);

        foreach (var claim in identity.FindAll(AsambleasClaimTypes.Permission).ToList())
        {
            identity.RemoveClaim(claim);
        }

        var roles = identity.FindAll(ClaimTypes.Role)
            .Select(c => c.Value)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (roles.Count == 0)
        {
            roles = (await UserManager.GetRolesAsync(user)).ToList();
        }

        if (roles.Count == 0 && !string.IsNullOrWhiteSpace(user.DemoRole))
        {
            roles.Add(user.DemoRole);
            identity.AddClaim(new Claim(ClaimTypes.Role, user.DemoRole));
        }

        foreach (var permission in RolePermissionMap.GetPermissions(roles))
        {
            identity.AddClaim(new Claim(AsambleasClaimTypes.Permission, permission));
        }

        return principal;
    }

    private static void EnsureSingleClaim(ClaimsIdentity identity, string claimType, string? value)
    {
        foreach (var existing in identity.FindAll(claimType).ToList())
        {
            identity.RemoveClaim(existing);
        }

        if (!string.IsNullOrWhiteSpace(value))
        {
            identity.AddClaim(new Claim(claimType, value));
        }
    }
}
