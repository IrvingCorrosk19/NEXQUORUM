namespace Asambleas.Application.Abstractions;

/// <summary>Fallback when hub presence is not registered (unit tests).</summary>
public sealed class NullAssemblyHubPresence : IAssemblyHubPresence
{
    public void SetConnected(Guid assemblyId, Guid userId, string connectionId)
    {
    }

    public void RemoveConnection(string connectionId)
    {
    }

    public bool IsHubConnected(Guid assemblyId, Guid userId) => false;

    public IReadOnlyCollection<Guid> ListConnectedUserIds(Guid assemblyId) => Array.Empty<Guid>();
}
