namespace Asambleas.Contracts.Realtime;

public sealed record RoomEntryChangedDto(
    Guid AssemblyId,
    Guid UserId,
    string DisplayName,
    string RoomEntryStatus,
    string? Message = null,
    string? RejectReason = null,
    DateTimeOffset AtUtc = default);

public sealed record DeviceActivationRequestDto(
    Guid AssemblyId,
    Guid TargetUserId,
    string Device, // "microphone" | "camera"
    string Message,
    string RequestedByDisplayName,
    DateTimeOffset AtUtc);

public sealed record AssemblyChatMessageDto(
    Guid Id,
    Guid AssemblyId,
    Guid AuthorUserId,
    string AuthorDisplayName,
    string Kind, // System | President | Participant | Announcement
    string Body,
    DateTimeOffset CreatedAtUtc,
    bool IsPinned = false);
