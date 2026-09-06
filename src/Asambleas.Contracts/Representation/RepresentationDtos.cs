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
    string? Method = null);

public sealed record BulkAccreditItemDto(
    Guid UserId,
    string DisplayName,
    bool Success,
    bool Skipped,
    string? Code,
    string? Message,
    decimal? EffectiveCoefficientPercent);

public sealed record BulkAccreditResponse(
    int Succeeded,
    int Failed,
    int Skipped,
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
