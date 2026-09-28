namespace Asambleas.Web.Realtime;

using System.Collections.Concurrent;
using Asambleas.Application.Abstractions;

/// <summary>
/// In-memory SignalR presence. Several tabs count as one person.
/// A dropped connection starts a short grace window before the person is treated as gone.
/// </summary>
public sealed class AssemblyHubPresenceTracker : IAssemblyHubPresence
{
    private readonly ConcurrentDictionary<string, (Guid AssemblyId, Guid UserId)> _byConnection = new();
    private readonly ConcurrentDictionary<(Guid AssemblyId, Guid UserId), ConcurrentDictionary<string, byte>> _connections = new();
    private readonly ConcurrentDictionary<(Guid AssemblyId, Guid UserId), (Guid TenantId, DateTimeOffset Deadline)> _grace = new();

    public void SetConnected(Guid assemblyId, Guid userId, string connectionId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionId);

        if (_byConnection.TryGetValue(connectionId, out var previous)
            && (previous.AssemblyId != assemblyId || previous.UserId != userId))
        {
            Detach(connectionId, previous.AssemblyId, previous.UserId);
        }

        _byConnection[connectionId] = (assemblyId, userId);
        var bag = _connections.GetOrAdd((assemblyId, userId), static _ => new ConcurrentDictionary<string, byte>());
        bag[connectionId] = 0;
        CancelDisconnectGrace(assemblyId, userId);
    }

    public void RemoveConnection(string connectionId)
    {
        if (!_byConnection.TryRemove(connectionId, out var pair))
        {
            return;
        }

        Detach(connectionId, pair.AssemblyId, pair.UserId);
    }

    public bool IsHubConnected(Guid assemblyId, Guid userId) =>
        _connections.TryGetValue((assemblyId, userId), out var bag) && !bag.IsEmpty;

    public IReadOnlyCollection<Guid> ListConnectedUserIds(Guid assemblyId)
    {
        var ids = new List<Guid>();
        foreach (var pair in _connections)
        {
            if (pair.Key.AssemblyId == assemblyId && !pair.Value.IsEmpty)
            {
                ids.Add(pair.Key.UserId);
            }
        }

        return ids;
    }

    public void BeginDisconnectGrace(Guid assemblyId, Guid userId, Guid tenantId, DateTimeOffset deadlineUtc) =>
        _grace[(assemblyId, userId)] = (tenantId, deadlineUtc);

    public void CancelDisconnectGrace(Guid assemblyId, Guid userId) =>
        _grace.TryRemove((assemblyId, userId), out _);

    public IReadOnlyList<PendingPresenceGrace> TakeExpiredDisconnectGrace(DateTimeOffset utcNow)
    {
        var expired = new List<PendingPresenceGrace>();
        foreach (var entry in _grace)
        {
            if (entry.Value.Deadline > utcNow)
            {
                continue;
            }

            if (_grace.TryRemove(entry.Key, out var value))
            {
                expired.Add(new PendingPresenceGrace(entry.Key.AssemblyId, entry.Key.UserId, value.TenantId));
            }
        }

        return expired;
    }

    private void Detach(string connectionId, Guid assemblyId, Guid userId)
    {
        if (!_connections.TryGetValue((assemblyId, userId), out var bag))
        {
            return;
        }

        bag.TryRemove(connectionId, out _);
        if (bag.IsEmpty)
        {
            _connections.TryRemove(new KeyValuePair<(Guid AssemblyId, Guid UserId), ConcurrentDictionary<string, byte>>((assemblyId, userId), bag));
        }
    }
}
