namespace Asambleas.Web.Realtime;

using System.Collections.Concurrent;
using Asambleas.Application.Abstractions;

/// <summary>In-memory SignalR presence (connection ≠ legal presence).</summary>
public sealed class AssemblyHubPresenceTracker : IAssemblyHubPresence
{
    private readonly ConcurrentDictionary<string, (Guid AssemblyId, Guid UserId)> _byConnection = new();
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, byte>> _byAssembly = new();

    public void SetConnected(Guid assemblyId, Guid userId, string connectionId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionId);

        if (_byConnection.TryGetValue(connectionId, out var previous)
            && (previous.AssemblyId != assemblyId || previous.UserId != userId))
        {
            RemoveFromAssembly(previous.AssemblyId, previous.UserId);
        }

        _byConnection[connectionId] = (assemblyId, userId);
        var users = _byAssembly.GetOrAdd(assemblyId, static _ => new ConcurrentDictionary<Guid, byte>());
        users[userId] = 0;
    }

    public void RemoveConnection(string connectionId)
    {
        if (!_byConnection.TryRemove(connectionId, out var pair))
        {
            return;
        }

        RemoveFromAssembly(pair.AssemblyId, pair.UserId);
    }

    public bool IsHubConnected(Guid assemblyId, Guid userId) =>
        _byAssembly.TryGetValue(assemblyId, out var users) && users.ContainsKey(userId);

    public IReadOnlyCollection<Guid> ListConnectedUserIds(Guid assemblyId) =>
        _byAssembly.TryGetValue(assemblyId, out var users)
            ? users.Keys.ToArray()
            : Array.Empty<Guid>();

    private void RemoveFromAssembly(Guid assemblyId, Guid userId)
    {
        if (!_byAssembly.TryGetValue(assemblyId, out var users))
        {
            return;
        }

        users.TryRemove(userId, out _);
        if (users.IsEmpty)
        {
            _byAssembly.TryRemove(assemblyId, out _);
        }
    }
}
