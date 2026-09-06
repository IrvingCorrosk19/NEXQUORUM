namespace Asambleas.Application.Attendance;

using System.Collections.Concurrent;
using Asambleas.Application.Abstractions;
using Microsoft.Extensions.Caching.Memory;

public sealed class VerifiedJoinProofService : IVerifiedJoinProofService
{
    public static readonly TimeSpan DefaultTtl = TimeSpan.FromHours(2);
    private readonly IMemoryCache _cache;
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<string, byte>> _byUser = new();

    public VerifiedJoinProofService(IMemoryCache cache)
    {
        _cache = cache;
    }

    public void Issue(
        Guid tenantId,
        Guid propertyHorizontalId,
        Guid assemblyId,
        Guid userId,
        Guid? accessLinkId,
        TimeSpan? ttl = null)
    {
        var key = CacheKey(tenantId, assemblyId, userId);
        var entry = new ProofEntry(tenantId, propertyHorizontalId, assemblyId, userId, accessLinkId, DateTimeOffset.UtcNow);
        var lifetime = ttl ?? DefaultTtl;
        _cache.Set(key, entry, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = lifetime
        });
        var bag = _byUser.GetOrAdd(userId, _ => new ConcurrentDictionary<string, byte>());
        bag[key] = 0;
    }

    public bool TryConsume(Guid tenantId, Guid assemblyId, Guid userId, out Guid? accessLinkId)
    {
        accessLinkId = null;
        var key = CacheKey(tenantId, assemblyId, userId);
        if (!_cache.TryGetValue(key, out ProofEntry? entry) || entry is null)
        {
            return false;
        }

        if (entry.TenantId != tenantId || entry.AssemblyId != assemblyId || entry.UserId != userId)
        {
            _cache.Remove(key);
            return false;
        }

        _cache.Remove(key);
        if (_byUser.TryGetValue(userId, out var bag))
        {
            bag.TryRemove(key, out _);
        }

        accessLinkId = entry.AccessLinkId;
        return true;
    }

    public void InvalidateUser(Guid userId)
    {
        if (!_byUser.TryRemove(userId, out var bag))
        {
            return;
        }

        foreach (var key in bag.Keys)
        {
            _cache.Remove(key);
        }
    }

    public void InvalidateAssemblyUser(Guid assemblyId, Guid userId)
    {
        // Best-effort: remove any keys for this user that contain the assembly id.
        if (!_byUser.TryGetValue(userId, out var bag))
        {
            return;
        }

        foreach (var key in bag.Keys.Where(k => k.Contains(assemblyId.ToString("N"), StringComparison.Ordinal)))
        {
            _cache.Remove(key);
            bag.TryRemove(key, out _);
        }
    }

    public bool Peek(Guid tenantId, Guid assemblyId, Guid userId) =>
        _cache.TryGetValue(CacheKey(tenantId, assemblyId, userId), out ProofEntry? e) && e is not null;

    private static string CacheKey(Guid tenantId, Guid assemblyId, Guid userId) =>
        $"vjl:{tenantId:N}:{assemblyId:N}:{userId:N}";

    private sealed record ProofEntry(
        Guid TenantId,
        Guid PropertyHorizontalId,
        Guid AssemblyId,
        Guid UserId,
        Guid? AccessLinkId,
        DateTimeOffset IssuedAtUtc);
}