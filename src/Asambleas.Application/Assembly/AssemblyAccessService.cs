namespace Asambleas.Application.Assembly;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Services;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Authorizes realtime/API access to an assembly without leaking cross-tenant rows.
/// Uses IgnoreQueryFilters only when matching the caller's tenant from claims/context.
/// </summary>
public sealed class AssemblyAccessService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;

    public AssemblyAccessService(IAsambleasDbContext db, ICurrentTenant currentTenant)
    {
        _db = db;
        _currentTenant = currentTenant;
    }

    public async Task EnsureCanJoinAssemblyAsync(
        Guid assemblyId,
        Guid userId,
        Guid tenantId,
        IReadOnlyCollection<string> permissions,
        CancellationToken cancellationToken = default)
    {
        if (tenantId == Guid.Empty || userId == Guid.Empty)
        {
            throw new DomainException("Authenticated tenant context is required.");
        }

        var canJoin = permissions.Contains(Permissions.MeetingJoin, StringComparer.Ordinal)
                      || permissions.Contains(Permissions.AssemblyView, StringComparer.Ordinal);

        if (!canJoin)
        {
            throw new DomainException("Forbidden: meeting:join or assembly:view is required.");
        }

        var assembly = await _db.Assemblies
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(a => a.Id == assemblyId)
            .Select(a => new { a.Id, a.TenantId, a.Status })
            .FirstOrDefaultAsync(cancellationToken);

        if (assembly is null)
        {
            throw new DomainException($"Assembly '{assemblyId}' was not found.");
        }

        if (assembly.TenantId != tenantId)
        {
            throw new DomainException("Cross-tenant access is not allowed.");
        }

        var isParticipant = await _db.AssemblyParticipants
            .IgnoreQueryFilters()
            .AsNoTracking()
            .AnyAsync(
                p => p.AssemblyId == assemblyId
                     && p.UserId == userId
                     && p.TenantId == tenantId,
                cancellationToken);

        if (!isParticipant)
        {
            throw new DomainException("Forbidden: user is not a participant of this assembly.");
        }
    }

    /// <summary>
    /// Returns assembly status after ensuring the caller may observe the hub group.
    /// Terminal assemblies may join SignalR for read-only broadcast; callers must not mutate presence.
    /// </summary>
    public async Task<AssemblyStatus> EnsureCanObserveAssemblyAsync(
        Guid assemblyId,
        Guid userId,
        Guid tenantId,
        IReadOnlyCollection<string> permissions,
        CancellationToken cancellationToken = default)
    {
        await EnsureCanJoinAssemblyAsync(assemblyId, userId, tenantId, permissions, cancellationToken);

        return await _db.Assemblies
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(a => a.Id == assemblyId && a.TenantId == tenantId)
            .Select(a => a.Status)
            .FirstAsync(cancellationToken);
    }

    public static bool AllowsPresenceMutation(AssemblyStatus status) =>
        AssemblyLifecycle.AllowsOperationalMutation(status);

    public async Task EnsureParticipantOfCurrentTenantAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var assemblyTenantId = await _db.Assemblies
            .AsNoTracking()
            .Where(a => a.Id == assemblyId)
            .Select(a => (Guid?)a.TenantId)
            .FirstOrDefaultAsync(cancellationToken);

        if (assemblyTenantId is null)
        {
            throw new DomainException($"Assembly '{assemblyId}' was not found.");
        }

        TenantGuard.EnsureTenantMatch(_currentTenant, assemblyTenantId.Value);

        var isParticipant = await _db.AssemblyParticipants
            .AsNoTracking()
            .AnyAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken);

        if (!isParticipant)
        {
            throw new DomainException("Forbidden: user is not a participant of this assembly.");
        }
    }
}
