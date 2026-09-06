namespace Asambleas.Contracts.Representation;

public sealed record RepresentationUnitDto(
    Guid UnitId,
    string UnitCode,
    decimal CoefficientPercent,
    string Source,
    Guid? PowerId,
    string? ConflictWithDisplayName);

public sealed record RepresentationConflictDto(
    Guid UnitId,
    string UnitCode,
    string ConflictType,
    string Message,
    Guid? ExistingRepresentativeUserId,
    string? ExistingRepresentativeName);

public sealed record RepresentationPreviewDto(
    Guid UserId,
    string DisplayName,
    Guid AssemblyId,
    IReadOnlyList<RepresentationUnitDto> Owned,
    IReadOnlyList<RepresentationUnitDto> Represented,
    decimal EffectiveCoefficientPercent,
    bool CanAccredit,
    IReadOnlyList<RepresentationConflictDto> Conflicts,
    bool IsAccredited,
    string AttendanceStatus,
    string? BlockReasonCode = null,
    string? BlockReasonMessage = null);

public sealed record AccreditRequest(
    string PresenceType,
    string? Method = null);

public sealed record AccreditResponse(
    Guid ParticipantId,
    string AttendanceStatus,
    bool IsAccredited,
    DateTimeOffset AccreditedAtUtc,
    DateTimeOffset CheckedInAtUtc,
    decimal EffectiveCoefficientPercent,
    IReadOnlyList<RepresentationUnitDto> Representations,
    bool QuorumReached,
    decimal CurrentQuorumCoefficient,
    decimal RequiredQuorumCoefficient,
    bool IdempotentReplay);

public sealed record BulkAccreditRequest(
    IReadOnlyList<Guid>? UserIds = null,
    bool AllEligible = false,
    string PresenceType = "InPerson",
    string? Method = null,
    /// <summary>
    /// Exceptional: include Registered invitees with no attendance evidence.
    /// Requires attendance:force-absent + typed confirmation phrase + reason.
    /// </summary>
    bool IncludeAbsentInvitees = false,
    bool ConfirmAccreditAbsentInvitees = false,
    string? AbsentAccreditationReason = null,
    string? AbsentConfirmationPhrase = null,
    Guid? ClientBatchId = null);

public sealed record BulkAccreditItemDto(
    Guid UserId,
    string DisplayName,
    bool Success,
    bool Skipped,
    string? Code,
    string? Message,
    decimal? EffectiveCoefficientPercent);

public sealed record BulkAccreditExclusionDto(
    Guid UserId,
    string DisplayName,
    string Code,
    string Reason,
    decimal? CoefficientPercent = null);

public sealed record BulkAccreditPreviewDto(
    Guid AssemblyId,
    int TotalCandidates,
    int AlreadyAccredited,
    int NewToAccredit,
    int Excluded,
    int AbsentInvitees,
    int UnitsRepresented,
    int Representations,
    decimal AggregateCoefficient,
    decimal CoefficientBefore,
    decimal EstimatedCoefficientAfter,
    decimal RequiredCoefficient,
    bool QuorumWouldReach,
    bool RequiresAbsentConfirmation,
    string Summary,
    IReadOnlyList<BulkAccreditExclusionDto> Exclusions);

public sealed record BulkAccreditResponse(
    Guid BatchId,
    int Requested,
    int Succeeded,
    int Failed,
    int Skipped,
    int Excluded,
    decimal CoefficientBefore,
    decimal CoefficientAfter,
    decimal RequiredCoefficient,
    bool QuorumReached,
    IReadOnlyList<BulkAccreditItemDto> Items,
    IReadOnlyList<BulkAccreditExclusionDto> Exclusions);

public sealed record DeaccreditRequest(
    string Reason,
    string? Method = null);

public sealed record DeaccreditResponse(
    Guid ParticipantId,
    string AttendanceStatus,
    bool IsAccredited,
    decimal PreviousCoefficient,
    decimal CurrentQuorumCoefficient,
    decimal RequiredQuorumCoefficient,
    bool QuorumReached);

public sealed record BulkDeaccreditRequest(
    IReadOnlyList<Guid> UserIds,
    string Reason,
    string? Method = null,
    Guid? ClientBatchId = null);

public sealed record BulkDeaccreditPreviewDto(
    Guid AssemblyId,
    int TotalCandidates,
    int AccreditedTargets,
    int AlreadyNotAccredited,
    int Excluded,
    decimal AggregateCoefficientToRemove,
    decimal CoefficientBefore,
    decimal EstimatedCoefficientAfter,
    decimal RequiredCoefficient,
    bool QuorumWouldRemain,
    string Summary,
    IReadOnlyList<BulkAccreditExclusionDto> Exclusions);

public sealed record BulkDeaccreditResponse(
    Guid BatchId,
    int Requested,
    int Succeeded,
    int Failed,
    int Skipped,
    decimal CoefficientBefore,
    decimal CoefficientAfter,
    decimal RequiredCoefficient,
    bool QuorumReached,
    IReadOnlyList<BulkAccreditItemDto> Items);

public sealed record PowerDto(
    Guid Id,
    Guid AssemblyId,
    Guid UnitId,
    string? UnitCode,
    Guid PrincipalOwnerId,
    string? PrincipalDisplayName,
    Guid RepresentativeUserId,
    string? RepresentativeDisplayName,
    string Status,
    string? EvidenceReference,
    DateTimeOffset? ValidatedAtUtc);
