namespace Asambleas.Web.Security;

using System.Security.Claims;
using Asambleas.Application.Security;
using Asambleas.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Allows Owner/Unit/Invite/PH lifecycle APIs when the user has the permission claim globally,
/// OR an active membership on the route PH with RoleHint PHAdmin (creator/admin of that PH).
/// Create-PH (POST without propertyHorizontalId) still requires a global ph:manage claim.
/// </summary>
public sealed class PhScopedAdminHandler : AuthorizationHandler<PhScopedAdminRequirement>
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IServiceScopeFactory _scopeFactory;

    public PhScopedAdminHandler(IHttpContextAccessor httpContextAccessor, IServiceScopeFactory scopeFactory)
    {
        _httpContextAccessor = httpContextAccessor;
        _scopeFactory = scopeFactory;
    }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PhScopedAdminRequirement requirement)
    {
        if (context.User.HasClaim(AsambleasClaimTypes.Permission, requirement.Permission)
            || context.User.HasClaim(AsambleasClaimTypes.Permission, Permissions.PhManage))
        {
            context.Succeed(requirement);
            return;
        }

        var http = _httpContextAccessor.HttpContext;
        if (http is null)
        {
            return;
        }

        if (!TryGetPropertyHorizontalId(http, out var phId))
        {
            return;
        }

        var userIdValue = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return;
        }

        await using var scope = _scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var isPhAdmin = await db.UserPropertyMemberships.AsNoTracking().AnyAsync(
            m => m.UserId == userId
                 && m.PropertyHorizontalId == phId
                 && m.IsActive
                 && (m.RoleHint == Roles.PHAdmin
                     || m.RoleHint == Roles.TenantAdmin
                     || m.RoleHint == Roles.PlatformAdmin));

        if (isPhAdmin)
        {
            context.Succeed(requirement);
        }
    }

    private static bool TryGetPropertyHorizontalId(HttpContext http, out Guid phId)
    {
        phId = default;
        if (http.Request.RouteValues.TryGetValue("propertyHorizontalId", out var routeVal)
            && Guid.TryParse(Convert.ToString(routeVal), out phId))
        {
            return true;
        }

        // Some clients pass phId as query (communications / deep links).
        if (http.Request.Query.TryGetValue("phId", out var q)
            && Guid.TryParse(q.ToString(), out phId))
        {
            return true;
        }

        return false;
    }
}
