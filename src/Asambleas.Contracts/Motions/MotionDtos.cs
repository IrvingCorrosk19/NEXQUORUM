namespace Asambleas.Contracts.Motions;

public sealed record MotionDto(
    Guid Id,
    Guid AssemblyId,
    Guid AgendaItemId,
    string Code,
    string Title,
    string Body,
    string Status,
    string DesignStatus = "Draft",
    string InstrumentKind = "FormalVote",
    string BallotKind = "FavorAgainstAbstain",
    string CalculationMethod = "Coefficient",
    string DecisionRuleCode = "SimpleMajority",
    decimal? RequiredThresholdPercent = null,
    string DefaultResultVisibilityPolicy = "HiddenUntilClose",
    string? OptionsJson = null,
    string? Instructions = null,
    string? QuestionText = null,
    bool IsSecret = false,
    string? TemplateKey = null,
    int VersionNumber = 1,
    Guid? RootMotionId = null,
    Guid? PreviousMotionId = null,
    Guid ConcurrencyStamp = default,
    string EditMode = "Full",
    int AcceptedBallots = 0,
    string? EditBlockReason = null,
    int DisplayOrder = 0);

public sealed record ReorderMotionsRequest(IReadOnlyList<Guid> OrderedMotionIds);

public sealed record CreateMotionRequest(
    Guid AgendaItemId,
    string Code,
    string Title,
    string Body,
    string? DesignStatus = null,
    string? InstrumentKind = null,
    string? BallotKind = null,
    string? CalculationMethod = null,
    string? DecisionRuleCode = null,
    decimal? RequiredThresholdPercent = null,
    string? DefaultResultVisibilityPolicy = null,
    string? OptionsJson = null,
    string? Instructions = null,
    string? QuestionText = null,
    bool IsSecret = false,
    string? TemplateKey = null);

public sealed record UpdateMotionRequest(
    Guid? AgendaItemId = null,
    string? Code = null,
    string? Title = null,
    string? Body = null,
    string? BallotKind = null,
    string? CalculationMethod = null,
    string? DecisionRuleCode = null,
    decimal? RequiredThresholdPercent = null,
    string? DefaultResultVisibilityPolicy = null,
    string? OptionsJson = null,
    string? Instructions = null,
    string? QuestionText = null,
    bool? IsSecret = null,
    string? TemplateKey = null,
    Guid? ExpectedConcurrencyStamp = null);

public sealed record PresentMotionRequest(Guid MotionId);

public sealed record CreateMotionVersionRequest(string? CodeSuffix = null);

public sealed record MotionEditPolicyDto(
    Guid MotionId,
    string EditMode,
    bool CanEditCritical,
    int AcceptedBallots,
    Guid? OpenVotingSessionId,
    string? Message,
    Guid ConcurrencyStamp);

public sealed record MotionResultDto(
    Guid MotionId,
    string Status,
    decimal InFavorCoefficient,
    decimal AgainstCoefficient,
    decimal AbstentionCoefficient);
