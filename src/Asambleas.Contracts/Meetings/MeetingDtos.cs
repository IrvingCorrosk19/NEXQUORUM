namespace Asambleas.Contracts.Meetings;

public sealed record MeetingJoinTokenRequest(Guid AssemblyId);

public sealed record MeetingJoinTokenResponse(
    Guid AssemblyId,
    string Provider,
    string RoomName,
    string Token,
    string ServerUrl,
    DateTimeOffset ExpiresAtUtc);

public sealed record MeetingRoomInfoDto(
    Guid AssemblyId,
    string Provider,
    string RoomName,
    bool IsAvailable,
    string? UnavailableReason);
