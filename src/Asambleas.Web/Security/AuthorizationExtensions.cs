namespace Asambleas.Web.Security;

using Asambleas.Application.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

public static class AuthorizationExtensions
{
    /// <summary>
    /// Permissions that a per-PH membership RoleHint=PHAdmin may satisfy for that PH only.
    /// </summary>
    private static readonly HashSet<string> PhScopedAdminPermissions = new(StringComparer.Ordinal)
    {
        Permissions.OwnerManage,
        Permissions.OwnerInvite,
        Permissions.UnitManage,
        Permissions.UnitView,
        Permissions.OwnerView,
        Permissions.PhView,
        Permissions.PhManage,
        Permissions.PhImport,
        Permissions.CommunicationsView,
        Permissions.CommunicationsConfigure,
        Permissions.CommunicationsTest,
        Permissions.TemplatesView,
        Permissions.TemplatesManage
    };

    public static IServiceCollection AddAsambleasPermissionPolicies(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddScoped<IAuthorizationHandler, PhScopedAdminHandler>();

        services.AddAuthorization(options =>
        {
            foreach (var permission in Permissions.All)
            {
                if (PhScopedAdminPermissions.Contains(permission))
                {
                    options.AddPolicy(
                        permission,
                        policy =>
                        {
                            policy.RequireAuthenticatedUser();
                            policy.AddRequirements(new PhScopedAdminRequirement(permission));
                        });
                    continue;
                }

                options.AddPolicy(
                    permission,
                    policy => policy.RequireClaim(AsambleasClaimTypes.Permission, permission));
            }

            options.AddPolicy(
                Permissions.PhCatalogOrPortal,
                policy => policy.RequireAssertion(ctx =>
                    ctx.User.HasClaim(AsambleasClaimTypes.Permission, Permissions.PhView)
                    || ctx.User.HasClaim(AsambleasClaimTypes.Permission, Permissions.PortalSelf)
                    || ctx.User.HasClaim(AsambleasClaimTypes.Permission, Permissions.PhManage)));
        });

        return services;
    }
}
