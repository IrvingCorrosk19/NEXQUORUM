namespace Asambleas.Contracts.Realtime;

/// <summary>
/// Real-time prompt asking a participant to join the live assembly room.
/// UI label: "Avisar para unirse" (not a phone call).
/// </summary>
public sealed record JoinSummonDto(
    Guid AssemblyId,
    Guid TargetUserId,
    string AssemblyTitle,
    string PropertyHorizontalName,
    string Message,
    string SummonedByDisplayName,
    DateTimeOffset SummonedAtUtc,
    string Channel,
    Guid? SummonId = null);

public sealed record JoinSummonResultDto(
    Guid AssemblyId,
    Guid TargetUserId,
    string Status,
    string Channel,
    string? Detail = null,
    DateTimeOffset? NextAllowedAtUtc = null);

public sealed record JoinSummonBatchResultDto(
    Guid AssemblyId,
    int Requested,
    int Notified,
    int SkippedConnected,
    int SkippedCooldown,
    int Failed,
    IReadOnlyList<JoinSummonResultDto> Results);
