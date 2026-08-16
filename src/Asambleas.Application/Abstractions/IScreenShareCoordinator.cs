namespace Asambleas.Application.Abstractions;

using Asambleas.Contracts.Meetings;

/// <summary>
/// Ephemeral single-presenter screen-share coordination per assembly (not media frames).
/// </summary>
public interface IScreenShareCoordinator
{
    ScreenShareStateDto? TryGet(Guid assemblyId);

    bool TryClaim(
        Guid assemblyId,
        Guid presenterUserId,
        string presenterDisplayName,
        out ScreenShareStateDto state,
        out ScreenShareStateDto? conflict);

    bool TryRelease(
        Guid assemblyId,
        Guid actorUserId,
        bool force,
        out ScreenShareStateDto state);

    void Clear(Guid assemblyId);
}
