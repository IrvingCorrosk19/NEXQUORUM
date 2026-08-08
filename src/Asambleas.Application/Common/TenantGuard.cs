namespace Asambleas.Application.Common;

using Asambleas.Application.Abstractions;
using Asambleas.Domain.Common;

internal static class TenantGuard
{
    public static void EnsureAuthenticated(ICurrentTenant currentTenant)
    {
        if (!currentTenant.IsAuthenticated || currentTenant.UserId is null || currentTenant.TenantId == Guid.Empty)
        {
            throw new DomainException("Authenticated tenant context is required.");
        }
    }

    public static void EnsureTenantMatch(ICurrentTenant currentTenant, Guid entityTenantId)
    {
        EnsureAuthenticated(currentTenant);

        if (entityTenantId != currentTenant.TenantId)
        {
            throw new DomainException("Cross-tenant access is not allowed.");
        }
    }

    public static Guid RequireUserId(ICurrentTenant currentTenant)
    {
        EnsureAuthenticated(currentTenant);
        return currentTenant.UserId!.Value;
    }
}
