namespace Asambleas.Application.Abstractions;

/// <summary>Fallback when hub presence is not registered (unit tests).</summary>
public sealed class NullAssemblyHubPresence : IAssemblyHubPresence
{
    public void SetConnected(Guid assemblyId, Guid userId, string connectionId, bool countsAsPresence = true)
    {
    }

    public void RemoveConnection(string connectionId)
    {
    }

    public bool IsHubConnected(Guid assemblyId, Guid userId) => false;

    public bool IsPresenceConnected(Guid assemblyId, Guid userId) => false;

    public IReadOnlyCollection<Guid> ListConnectedUserIds(Guid assemblyId) => Array.Empty<Guid>();

    public void BeginDisconnectGrace(Guid assemblyId, Guid userId, Guid tenantId, DateTimeOffset deadlineUtc)
    {
    }

    public void CancelDisconnectGrace(Guid assemblyId, Guid userId)
    {
    }

    public IReadOnlyList<PendingPresenceGrace> TakeExpiredDisconnectGrace(DateTimeOffset utcNow) =>
        Array.Empty<PendingPresenceGrace>();
}
