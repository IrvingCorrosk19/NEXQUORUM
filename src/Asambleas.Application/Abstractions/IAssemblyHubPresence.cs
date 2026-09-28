namespace Asambleas.Application.Abstractions;

/// <summary>
/// Tracks who currently has an active SignalR hub connection for an assembly.
/// Distinct from legal attendance / accreditation.
/// </summary>
public interface IAssemblyHubPresence
{
    void SetConnected(Guid assemblyId, Guid userId, string connectionId);

    void RemoveConnection(string connectionId);

    bool IsHubConnected(Guid assemblyId, Guid userId);

    IReadOnlyCollection<Guid> ListConnectedUserIds(Guid assemblyId);

    /// <summary>Last SignalR connection dropped. Quorum still counts until <paramref name="deadlineUtc"/>.</summary>
    void BeginDisconnectGrace(Guid assemblyId, Guid userId, Guid tenantId, DateTimeOffset deadlineUtc);

    void CancelDisconnectGrace(Guid assemblyId, Guid userId);

    IReadOnlyList<PendingPresenceGrace> TakeExpiredDisconnectGrace(DateTimeOffset utcNow);
}

public readonly record struct PendingPresenceGrace(Guid AssemblyId, Guid UserId, Guid TenantId);
