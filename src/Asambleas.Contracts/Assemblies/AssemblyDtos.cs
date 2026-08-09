namespace Asambleas.Contracts.Assemblies;

using Asambleas.Contracts.Agenda;
using Asambleas.Contracts.Audit;
using Asambleas.Contracts.Meetings;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Quorum;
using Asambleas.Contracts.Speakers;
using Asambleas.Contracts.Voting;

public sealed record AssemblySummaryDto(
    Guid Id,
    Guid TenantId,
    Guid PropertyHorizontalId,
    string Title,
    string Modality,
    string Status,
    DateTimeOffset ScheduledAtUtc,
    decimal RequiredQuorumPercent,
    Guid? ActiveAgendaItemId);

public sealed record AssemblyDetailDto(
    Guid Id,
    Guid TenantId,
    Guid PropertyHorizontalId,
    string PropertyHorizontalName,
    string Title,
    string Modality,
    string Status,
    DateTimeOffset ScheduledAtUtc,
    decimal RequiredQuorumPercent,
    Guid? ActiveAgendaItemId,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc);

public sealed record CreateAssemblyRequest(
    Guid PropertyHorizontalId,
    string Title,
    string Modality,
    DateTimeOffset ScheduledAtUtc,
    decimal RequiredQuorumPercent);

public sealed record TransitionAssemblyStatusRequest(string TargetStatus);

public sealed record AssemblyParticipantDto(
    Guid Id,
    Guid AssemblyId,
    Guid UserId,
    Guid? UnitId,
    string? UnitCode,
    decimal? CoefficientPercent,
    string DisplayName,
    string RoleCode,
    string AttendanceStatus,
    DateTimeOffset? CheckedInAtUtc,
    bool IsAccredited = false,
    decimal EffectiveCoefficientPercent = 0m,
    DateTimeOffset? AccreditedAtUtc = null,
    int RepresentationCount = 0,
    string? PresenceType = null);

public sealed record CheckInRequest(Guid? UnitId, string PresenceType);

public sealed record CheckInResponse(
    Guid ParticipantId,
    string AttendanceStatus,
    DateTimeOffset CheckedInAtUtc,
    bool IsAccredited = false,
    decimal EffectiveCoefficientPercent = 0m,
    bool IdempotentReplay = false);

/// <summary>
/// Viewer role for room UI: Operator (president/secretary/operator), Owner, or Auditor.
/// </summary>
public static class AssemblyViewerRoles
{
    public const string Operator = "Operator";
    public const string Owner = "Owner";
    public const string Auditor = "Auditor";
}

public static class AssemblyPrimaryCtas
{
    public const string Prepare = "Prepare";
    public const string StartCheckIn = "StartCheckIn";
    public const string StartAssembly = "StartAssembly";
    public const string Continue = "Continue";
    public const string ViewResults = "ViewResults";
}

public sealed record AssemblyReadinessDto(
    bool ParticipantsReady,
    bool CoefficientsReady,
    bool AgendaReady,
    bool MeetingReady,
    bool VotingRulesReady,
    bool ReadyToStart,
    IReadOnlyList<string> Blockers);

public sealed record AssemblyDashboardCountsDto(
    int Participants,
    int CheckedIn,
    int EligibleUnits,
    int AgendaItems,
    int Motions);

public sealed record AssemblyDashboardDto(
    Guid Id,
    string Name,
    Guid PropertyHorizontalId,
    string PropertyHorizontalName,
    DateTimeOffset ScheduledAtUtc,
    string Status,
    string Modality,
    AssemblyReadinessDto Readiness,
    AssemblyDashboardCountsDto Counts,
    string PrimaryCta);

public sealed record AssemblyRoomStateDto(
    AssemblyDetailDto Assembly,
    AssemblyReadinessDto Readiness,
    QuorumDto? Quorum,
    AgendaListResponse Agenda,
    MotionDto? ActiveMotion,
    VotingSessionDto? OpenVotingSession,
    VotingResultsDto? OpenSessionResultsOrNull,
    bool CurrentUserHasVoted,
    Guid? CurrentUserEvidenceId,
    IReadOnlyList<AssemblyParticipantDto> Participants,
    SpeakerQueueDto SpeakerQueue,
    MeetingRoomInfoDto? Meeting,
    string ViewerRole,
    DateTimeOffset? AssemblyStartedAtUtc);

public sealed record AssemblyMinutesMotionEntryDto(
    MotionDto Motion,
    VotingSessionDto? ClosedSession,
    VotingResultsDto? Results);

public sealed record AssemblyMinutesDto(
    Guid AssemblyId,
    string Title,
    string PropertyHorizontalName,
    DateTimeOffset ScheduledAtUtc,
    string Status,
    string Modality,
    DateTimeOffset GeneratedAtUtc,
    IReadOnlyList<AssemblyParticipantDto> CheckedInParticipants,
    QuorumDto? LatestQuorum,
    IReadOnlyList<AgendaItemDto> Agenda,
    IReadOnlyList<AssemblyMinutesMotionEntryDto> Motions,
    DateTimeOffset? CheckInStartedAtUtc,
    DateTimeOffset? AssemblyStartedAtUtc,
    DateTimeOffset? CompletedAtUtc);

public sealed record AssemblyEvidenceDto(
    Guid AssemblyId,
    string Title,
    DateTimeOffset GeneratedAtUtc,
    IReadOnlyList<AssemblyParticipantDto> Attendance,
    IReadOnlyList<QuorumSnapshotDto> QuorumSnapshots,
    IReadOnlyList<MotionDto> Motions,
    IReadOnlyList<AssemblyMinutesMotionEntryDto> Voting,
    IReadOnlyList<AuditEventDto> AuditSummary);
