namespace Asambleas.Contracts.Speakers;

public sealed record SpeakerRequestDto(
    Guid Id,
    Guid AssemblyId,
    Guid UserId,
    string DisplayName,
    string Status,
    DateTimeOffset RequestedAtUtc,
    DateTimeOffset? GrantedAtUtc,
    DateTimeOffset? CompletedAtUtc,
    int QueueOrder);

public sealed record CreateSpeakerRequest(string? DisplayName);

public sealed record GrantSpeakerRequest(Guid SpeakerRequestId);

public sealed record CompleteSpeakerRequest(Guid SpeakerRequestId);

public sealed record SpeakerQueueDto(
    Guid AssemblyId,
    Guid? CurrentSpeakerRequestId,
    IReadOnlyList<SpeakerRequestDto> Queue);
