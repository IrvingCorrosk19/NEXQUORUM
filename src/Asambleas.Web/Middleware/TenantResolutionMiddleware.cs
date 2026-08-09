namespace Asambleas.Web.Middleware;

using System.Security.Claims;
using Asambleas.Infrastructure.Tenancy;
using Asambleas.Web.Security;
using Serilog.Context;

public sealed class TenantResolutionMiddleware
{
    private readonly RequestDelegate _next;

    public TenantResolutionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, CurrentTenant currentTenant)
    {
        var user = context.User;
        if (user.Identity?.IsAuthenticated == true)
        {
            currentTenant.IsAuthenticated = true;
            currentTenant.UserId = ParseGuid(user, ClaimTypes.NameIdentifier) ?? ParseGuid(user, "sub");
            currentTenant.TenantId = ParseGuid(user, AsambleasClaimTypes.TenantId) ?? Guid.Empty;
            currentTenant.OrganizationId = ParseGuid(user, AsambleasClaimTypes.OrganizationId);
            currentTenant.PropertyHorizontalId = ParseGuid(user, AsambleasClaimTypes.PropertyHorizontalId);
            currentTenant.DisplayName = user.FindFirstValue(ClaimTypes.Name) ?? user.Identity?.Name;
            currentTenant.Roles = user.FindAll(ClaimTypes.Role).Select(c => c.Value).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            currentTenant.Permissions = user.FindAll(AsambleasClaimTypes.Permission).Select(c => c.Value).Distinct(StringComparer.Ordinal).ToArray();
        }

        using (LogContext.PushProperty("TenantId", currentTenant.TenantId == Guid.Empty ? null : currentTenant.TenantId))
        using (LogContext.PushProperty("UserId", currentTenant.UserId))
        {
            await _next(context);
        }
    }

    private static Guid? ParseGuid(ClaimsPrincipal user, string claimType)
    {
        var value = user.FindFirstValue(claimType);
        return Guid.TryParse(value, out var id) ? id : null;
    }
}
