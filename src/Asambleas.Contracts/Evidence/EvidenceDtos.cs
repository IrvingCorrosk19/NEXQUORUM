namespace Asambleas.Contracts.Evidence;

using Asambleas.Contracts.Agenda;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Audit;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Quorum;
using Asambleas.Contracts.Speakers;
using Asambleas.Contracts.Voting;

public sealed record DecisionDto(
    string DecisionNumber,
    Guid AssemblyId,
    Guid MotionId,
    string MotionCode,
    string MotionTitle,
    Guid? AgendaItemId,
    string DecisionStatus,
    string AppliedDecisionRule,
    decimal InFavorCoefficient,
    decimal AgainstCoefficient,
    decimal AbstentionCoefficient,
    int VotesCast,
    DateTimeOffset? DecidedAtUtc,
    Guid VotingSessionId,
    bool SecretBallot,
    string Explanation);

public sealed record RepresentationEvidenceDto(
    Guid UnitId,
    string UnitCode,
    decimal CoefficientSnapshot,
    Guid RepresentativeUserId,
    string RepresentativeDisplayName,
    string Source,
    Guid? PowerId,
    bool IsActive);

public sealed record EvidenceCompletenessDto(
    string Status,
    IReadOnlyList<string> Notes,
    bool HasAttendance,
    bool HasQuorum,
    bool HasAgenda,
    bool HasDecisions,
    bool IsClosed);

/// <summary>Fact-only evidence package — never AI narrative.</summary>
public sealed record AssemblyEvidencePackageDto(
    Guid AssemblyId,
    string Title,
    string PropertyHorizontalName,
    string Status,
    string Modality,
    DateTimeOffset ScheduledAtUtc,
    DateTimeOffset GeneratedAtUtc,
    EvidenceCompletenessDto Completeness,
    IReadOnlyList<AssemblyParticipantDto> Attendance,
    IReadOnlyList<RepresentationEvidenceDto> Representations,
    IReadOnlyList<QuorumSnapshotDto> QuorumSnapshots,
    QuorumDto? LatestQuorum,
    IReadOnlyList<AgendaItemDto> Agenda,
    IReadOnlyList<SpeakerRequestDto> Interventions,
    IReadOnlyList<MotionDto> Motions,
    IReadOnlyList<AssemblyMinutesMotionEntryDto> Voting,
    IReadOnlyList<DecisionDto> Decisions,
    IReadOnlyList<AuditEventDto> Timeline);

/// <summary>Structured minutes derived from verified facts only.</summary>
public sealed record AssemblyMinutesDocumentDto(
    Guid AssemblyId,
    string Title,
    string PropertyHorizontalName,
    string Status,
    string Modality,
    DateTimeOffset ScheduledAtUtc,
    DateTimeOffset GeneratedAtUtc,
    string DocumentId,
    string? ContentHash,
    EvidenceCompletenessDto Completeness,
    DateTimeOffset? CheckInStartedAtUtc,
    DateTimeOffset? AssemblyStartedAtUtc,
    DateTimeOffset? CompletedAtUtc,
    QuorumDto? Quorum,
    IReadOnlyList<AssemblyParticipantDto> Attendance,
    IReadOnlyList<RepresentationEvidenceDto> Representations,
    IReadOnlyList<AgendaItemDto> Agenda,
    IReadOnlyList<SpeakerRequestDto> Interventions,
    IReadOnlyList<AssemblyMinutesMotionEntryDto> Motions,
    IReadOnlyList<DecisionDto> Decisions,
    string Disclaimer,
    bool IsSealed = false);
