namespace Asambleas.Contracts.Assemblies;

public sealed record ParticipantsPageDto(
    int Total,
    int Skip,
    int Take,
    IReadOnlyList<AssemblyParticipantDto> Items);

public sealed record VerifiedJoinStatusDto(
    Guid AssemblyId,
    Guid UserId,
    bool HasServerProof);

public sealed record AttendanceExceptionItemDto(
    Guid UserId,
    string DisplayName,
    string? UnitCode,
    string ConflictType,
    int RepresentationCount,
    string? Evidence,
    string? Reason,
    DateTimeOffset? ObservedAtUtc,
    string? AvailableAction,
    string? ResolvedBy,
    string? ResolutionResult);

public sealed record ResolveAttendanceExceptionRequest(
    string Action,
    string? Reason = null,
    string? Note = null);
