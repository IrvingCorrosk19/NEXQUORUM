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
}
