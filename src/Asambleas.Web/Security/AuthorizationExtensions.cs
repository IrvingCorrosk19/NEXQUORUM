namespace Asambleas.Web.Security;

using Asambleas.Application.Security;
using Microsoft.AspNetCore.Authorization;

public static class AuthorizationExtensions
{
    public static IServiceCollection AddAsambleasPermissionPolicies(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            foreach (var permission in Permissions.All)
            {
                options.AddPolicy(
                    permission,
                    policy => policy.RequireClaim(AsambleasClaimTypes.Permission, permission));
            }
        });

        return services;
    }
}
