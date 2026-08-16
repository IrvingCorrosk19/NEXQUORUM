namespace Asambleas.Contracts.Meetings;

public sealed record ScreenShareStateDto(
    Guid AssemblyId,
    bool IsActive,
    Guid? PresenterUserId,
    string? PresenterDisplayName,
    DateTimeOffset? StartedAtUtc,
    bool CurrentUserCanStart,
    bool CurrentUserIsPresenter,
    bool CurrentUserCanForceStop);

public sealed record StartScreenShareResponse(ScreenShareStateDto State);

public sealed record StopScreenShareResponse(ScreenShareStateDto State);
