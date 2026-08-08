namespace Asambleas.Contracts.Voting;

public sealed record VotingSessionDto(
    Guid Id,
    Guid AssemblyId,
    Guid MotionId,
    string Status,
    DateTimeOffset? OpenedAtUtc,
    DateTimeOffset? ClosedAtUtc,
    bool HidePartialResults,
    string? AppliedDecisionRule = null,
    string? DecisionStatus = null);

public sealed record OpenVotingSessionRequest(Guid MotionId, bool HidePartialResults);

public sealed record CastVoteRequest(string Choice, Guid? UnitId, string? ClientRequestId = null);

public sealed record CastVoteResponse(
    Guid VoteId,
    Guid VotingSessionId,
    Guid EvidenceId,
    DateTimeOffset CastAtUtc,
    bool IdempotentReplay = false);

public sealed record VoteTallyDto(
    Guid VotingSessionId,
    Guid MotionId,
    decimal InFavorCoefficient,
    decimal AgainstCoefficient,
    decimal AbstentionCoefficient,
    int VotesCast,
    string? DecisionStatus,
    int InFavorVotes = 0,
    int AgainstVotes = 0,
    int AbstentionVotes = 0,
    string? AppliedDecisionRule = null,
    string? DecisionExplanation = null);

/// <summary>
/// Room hydrate results payload (aligned with <see cref="VoteTallyDto"/>). Null when partial results are hidden.
/// </summary>
public sealed record VotingResultsDto(
    Guid VotingSessionId,
    Guid MotionId,
    decimal InFavorCoefficient,
    decimal AgainstCoefficient,
    decimal AbstentionCoefficient,
    int VotesCast,
    string? DecisionStatus,
    int InFavorVotes = 0,
    int AgainstVotes = 0,
    int AbstentionVotes = 0,
    string? AppliedDecisionRule = null,
    string? DecisionExplanation = null);

public sealed record VoteReceiptDto(
    Guid VotingSessionId,
    Guid EvidenceId,
    DateTimeOffset CastAtUtc);

/// <summary>
/// Semantic vote/eligibility status for recovery UX (never trust client for truth).
/// </summary>
public sealed record MyVoteStatusDto(
    Guid VotingSessionId,
    string Status,
    Guid? EvidenceId,
    DateTimeOffset? CastAtUtc,
    decimal? RepresentedCoefficientPercent,
    Guid? UnitId,
    string? UnitCode);

public sealed record CloseVotingSessionResponse(
    Guid VotingSessionId,
    Guid MotionId,
    string MotionStatus,
    VoteTallyDto Tally);
