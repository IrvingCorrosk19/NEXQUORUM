namespace Asambleas.Application.Abstractions;

public interface IMeetingProvider
{
    Task<MeetingRoomInfo> EnsureRoomAsync(Guid assemblyId, string roomName, CancellationToken cancellationToken = default);

    Task<MeetingJoinToken> CreateParticipantTokenAsync(MeetingJoinRequest request, CancellationToken cancellationToken = default);

    Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default);
}

public sealed record MeetingJoinRequest(
    Guid AssemblyId,
    Guid UserId,
    string DisplayName,
    string RoomName,
    bool CanPublish,
    bool CanSubscribe,
    TimeSpan? Ttl = null);

public sealed record MeetingRoomInfo(
    Guid AssemblyId,
    string Provider,
    string RoomName,
    bool IsAvailable,
    string? UnavailableReason);

public sealed record MeetingJoinToken(
    Guid AssemblyId,
    string Provider,
    string RoomName,
    string Token,
    string ServerUrl,
    DateTimeOffset ExpiresAtUtc);
