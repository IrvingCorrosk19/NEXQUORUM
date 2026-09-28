namespace Asambleas.Application.Abstractions;

/// <summary>
/// Tracks who currently has an active SignalR hub connection for an assembly.
/// Distinct from legal attendance / accreditation.
/// </summary>
public interface IAssemblyHubPresence
{
    void SetConnected(Guid assemblyId, Guid userId, string connectionId, bool countsAsPresence = true);

    void RemoveConnection(string connectionId);

    /// <summary>Any hub connection, including the lobby observing without joining the room.</summary>
    bool IsHubConnected(Guid assemblyId, Guid userId);

    /// <summary>A connection that joined the room and should count toward live presence.</summary>
    bool IsPresenceConnected(Guid assemblyId, Guid userId);

    IReadOnlyCollection<Guid> ListConnectedUserIds(Guid assemblyId);

    /// <summary>Last room connection dropped. Live quorum stops immediately; Left is recorded at <paramref name="deadlineUtc"/>.</summary>
    void BeginDisconnectGrace(Guid assemblyId, Guid userId, Guid tenantId, DateTimeOffset deadlineUtc);

    void CancelDisconnectGrace(Guid assemblyId, Guid userId);

    IReadOnlyList<PendingPresenceGrace> TakeExpiredDisconnectGrace(DateTimeOffset utcNow);
}

public readonly record struct PendingPresenceGrace(Guid AssemblyId, Guid UserId, Guid TenantId);
