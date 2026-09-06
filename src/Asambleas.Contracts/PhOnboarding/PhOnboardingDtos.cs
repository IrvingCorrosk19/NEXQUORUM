namespace Asambleas.Contracts.PhOnboarding;

public sealed record PhSummaryDto(
    Guid Id,
    string Code,
    string Name,
    string? LegalName,
    string Status,
    int OnboardingStep,
    int UnitCount,
    int OwnerCount,
    int ActiveUserCount,
    decimal CoefficientTotalPercent,
    bool CoefficientsComplete,
    string TimeZoneId,
    DateTimeOffset? NextAssemblyAtUtc,
    string? NextAssemblyTitle);

public sealed record PhDetailDto(
    Guid Id,
    Guid OrganizationId,
    string Code,
    string Name,
    string? LegalName,
    string? Country,
    string? StateProvince,
    string? City,
    string? Address,
    string TimeZoneId,
    string? AdminEmail,
    string? Phone,
    string Status,
    int OnboardingStep,
    string ConcurrencyStamp);

public sealed record CreatePhRequest(
    string Name,
    string? LegalName,
    string Code,
    string? Country,
    string? StateProvince,
    string? City,
    string? Address,
    string TimeZoneId,
    string? AdminEmail,
    string? Phone,
    Guid? OrganizationId);

public sealed record UpdatePhRequest(
    string Name,
    string? LegalName,
    string? Country,
    string? StateProvince,
    string? City,
    string? Address,
    string TimeZoneId,
    string? AdminEmail,
    string? Phone,
    int? OnboardingStep,
    string? ConcurrencyStamp);

public sealed record DeactivateEntityRequest(string? Reason);

public sealed record EntityDeleteEvaluationDto(
    bool CanHardDelete,
    string Summary,
    string SuggestedAction,
    IReadOnlyList<string> BlockingReasons,
    IReadOnlyDictionary<string, int> Dependencies);

public sealed record UnitDto(
    Guid Id,
    Guid PropertyHorizontalId,
    string Code,
    string? Tower,
    int? Floor,
    string? UnitType,
    decimal CoefficientPercent,
    bool IsActive);

public sealed record CreateUnitRequest(
    string Code,
    string? Tower,
    int? Floor,
    string? UnitType,
    decimal CoefficientPercent,
    bool IsActive = true);

public sealed record UpdateUnitRequest(
    string Code,
    string? Tower,
    int? Floor,
    string? UnitType,
    decimal CoefficientPercent,
    bool? IsActive = true);

public sealed record BulkGenerateUnitsRequest(
    string? Tower,
    int FloorFrom,
    int FloorTo,
    int UnitFrom,
    int UnitTo,
    int UnitNumberPad,
    string? Prefix,
    string? UnitType,
    decimal DefaultCoefficientPercent,
    bool PreviewOnly);

public sealed record BulkGenerateUnitsResultDto(
    int WouldCreate,
    int SkippedExisting,
    IReadOnlyList<string> PreviewCodes,
    IReadOnlyList<UnitDto> Created);

public sealed record OwnerListItemDto(
    Guid Id,
    string DisplayName,
    string Email,
    string? Identification,
    string Status,
    IReadOnlyList<string> UnitCodes,
    decimal CoefficientPercent,
    bool HasUser,
    bool HasEmail,
    Guid? UserId,
    string PlatformAccessStatus,
    DateTimeOffset? InvitationExpiresAtUtc);

public sealed record OwnerDetailDto(
    Guid Id,
    string DisplayName,
    string? FirstName,
    string? LastName,
    string? IdentificationType,
    string? Identification,
    string Email,
    string? Phone,
    string Status,
    Guid? UserId,
    string ConcurrencyStamp,
    IReadOnlyList<OwnerUnitLinkDto> Units,
    string PlatformAccessStatus,
    DateTimeOffset? InvitationExpiresAtUtc,
    bool PhAccessActive);

public sealed record OwnerUnitLinkDto(
    Guid OwnershipId,
    Guid UnitId,
    string UnitCode,
    string? Tower,
    decimal UnitCoefficientPercent,
    decimal SharePercent,
    bool IsActive,
    DateTimeOffset EffectiveFromUtc,
    DateTimeOffset? EffectiveToUtc);

public sealed record CreateOwnerRequest(
    string? FirstName,
    string? LastName,
    string? DisplayName,
    string? IdentificationType,
    string? Identification,
    string Email,
    string? Phone,
    Guid? UnitId,
    decimal? SharePercent);

public sealed record UpdateOwnerRequest(
    string? FirstName,
    string? LastName,
    string? DisplayName,
    string? IdentificationType,
    string? Identification,
    string Email,
    string? Phone,
    string? Status,
    string? ConcurrencyStamp);

public sealed record CreateOwnershipRequest(
    Guid OwnerId,
    Guid UnitId,
    decimal SharePercent,
    DateTimeOffset? EffectiveFromUtc);

public sealed record UpdateOwnershipShareRequest(decimal SharePercent);

public sealed record TransferOwnershipRequest(
    Guid FromOwnershipId,
    Guid ToOwnerId,
    DateTimeOffset? EffectiveFromUtc,
    decimal? SharePercent,
    string? Reason);

public sealed record UnitOwnerLinkDto(
    Guid OwnershipId,
    Guid OwnerId,
    string OwnerDisplayName,
    string? OwnerEmail,
    decimal SharePercent,
    bool IsActive,
    DateTimeOffset EffectiveFromUtc,
    DateTimeOffset? EffectiveToUtc,
    string? OwnerIdentification = null,
    string? OwnerPhone = null,
    string OwnerStatus = "Active",
    IReadOnlyList<string>? OtherUnitCodesInPh = null);

public sealed record UnitOwnershipDetailDto(
    Guid UnitId,
    string UnitCode,
    string? Tower,
    int? Floor,
    string? UnitType,
    decimal CoefficientPercent,
    bool IsActive,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    decimal ActiveShareTotalPercent,
    bool OwnershipComplete,
    decimal MissingSharePercent,
    IReadOnlyList<UnitOwnerLinkDto> Owners);

public sealed record OwnershipTransferResultDto(
    Guid EndedOwnershipId,
    Guid NewOwnershipId,
    Guid UnitId,
    string UnitCode,
    Guid FromOwnerId,
    string FromOwnerName,
    Guid ToOwnerId,
    string ToOwnerName,
    decimal SharePercent,
    DateTimeOffset EffectiveFromUtc);

public sealed record CoefficientValidationDto(
    Guid PropertyHorizontalId,
    decimal TotalPercent,
    decimal ExpectedPercent,
    decimal DeltaPercent,
    bool IsComplete,
    int ActiveUnitCount,
    string Message);

public sealed record PhReadinessDto(
    Guid PropertyHorizontalId,
    string Name,
    bool GeneralInfoComplete,
    int UnitCount,
    bool UnitsComplete,
    int OwnerCount,
    bool OwnersComplete,
    CoefficientValidationDto Coefficients,
    int InvitedUserCount,
    bool AssemblyConfigComplete,
    bool ReadyForAssembly,
    IReadOnlyList<string> BlockingIssues);

public sealed record ImportColumnMappingDto(
    string SystemField,
    string? SourceColumn);

public sealed record ImportAnalyzeResultDto(
    Guid SessionId,
    IReadOnlyList<string> DetectedColumns,
    IReadOnlyList<ImportColumnMappingDto> SuggestedMappings,
    int RowCount);

public sealed record ImportValidateRequest(
    Guid SessionId,
    IReadOnlyList<ImportColumnMappingDto> Mappings);

public sealed record ImportRowIssueDto(
    int RowNumber,
    string Field,
    string? Value,
    string Problem,
    string SuggestedAction,
    string Severity);

public sealed record ImportPreviewDto(
    Guid SessionId,
    int TotalRows,
    int ValidRows,
    int WarningRows,
    int ErrorRows,
    IReadOnlyList<ImportRowIssueDto> Issues,
    IReadOnlyList<ImportPreviewRowDto> SampleRows);

public sealed record ImportPreviewRowDto(
    int RowNumber,
    string? UnitCode,
    string? Tower,
    int? Floor,
    decimal? CoefficientPercent,
    string? FirstName,
    string? LastName,
    string? Identification,
    string? Email,
    string? Phone,
    bool IsValid);

public sealed record ImportCommitResultDto(
    int UnitsCreated,
    int OwnersCreated,
    int OwnershipsCreated,
    int Skipped,
    IReadOnlyList<ImportRowIssueDto> RemainingIssues);

public sealed record InviteOwnerResultDto(
    Guid InvitationId,
    string EmailMasked,
    DateTimeOffset ExpiresAtUtc,
    bool ExistingUserLinked,
    bool RequiresLoginToAccept,
    bool EmailSent,
    string Provider,
    bool UsedSandbox,
    string? Detail);

public sealed record OwnerPasswordResetRequestResultDto(
    Guid ResetId,
    string EmailMasked,
    DateTimeOffset ExpiresAtUtc,
    bool EmailSent,
    string Provider,
    bool UsedSandbox,
    string? Detail);

public sealed record ActivateInvitationRequest(
    string Token,
    string Password,
    string? DisplayName);

public sealed record AcceptInvitationRequest(string Token);

public sealed record InvitationPreviewDto(
    string Email,
    string OwnerDisplayName,
    string PropertyHorizontalName,
    DateTimeOffset ExpiresAtUtc,
    bool RequiresLoginToAccept,
    bool IsExpired = false,
    string? ErrorCode = null,
    string? ErrorMessage = null);

public sealed record PhMembershipDto(
    Guid PropertyHorizontalId,
    string Code,
    string Name,
    string RoleHint,
    bool IsCurrent);

public sealed record SwitchPhRequest(Guid PropertyHorizontalId);

public sealed record OwnerQuery(
    string? Search = null,
    string? Tower = null,
    int? Floor = null,
    string? Status = null,
    bool? HasEmail = null,
    bool? Invited = null,
    bool? HasUser = null,
    string? AccessStatus = null);

public sealed record BulkInviteRequest(IReadOnlyList<Guid> OwnerIds);

public sealed record BulkInviteResultDto(
    int Processed,
    int Sent,
    int AlreadyActive,
    int WithoutEmail,
    int Failed,
    int RequiresLogin,
    IReadOnlyList<string> Errors);

public sealed record BulkInvitePreviewDto(
    int Selected,
    int WithEmail,
    int WithoutEmail,
    int AlreadyActive,
    int Pending,
    int ToInvite);

public sealed record MyOwnerProfileDto(
    string DisplayName,
    string Email,
    string? Phone,
    IReadOnlyList<MyOwnerUnitDto> Units,
    IReadOnlyList<PhMembershipDto> Properties);

public sealed record MyOwnerUnitDto(
    string UnitCode,
    string? Tower,
    decimal SharePercent,
    decimal UnitCoefficientPercent,
    string PropertyHorizontalName,
    bool IsActive);

public sealed record BulkValidateOwnersResultDto(
    int OwnerCount,
    int WithoutEmail,
    int WithoutUnit,
    int WithoutUser,
    IReadOnlyList<string> Issues);

// --- Multi-sheet PH roster import (MotionImport-style preview/commit) ---

public static class PhRosterImportModes
{
    public const string CreateOnly = "CreateOnly";
    public const string CreateAndUpdate = "CreateAndUpdate";
}

public static class PhRosterImportSheets
{
    public const string Units = "Units";
    public const string Owners = "Owners";
    public const string Relations = "Relations";
}

public sealed record PhRosterImportPreviewDto(
    Guid SessionId,
    Guid PhId,
    string PhName,
    string Mode,
    IReadOnlyList<PhRosterUnitRowDto> Units,
    IReadOnlyList<PhRosterOwnerRowDto> Owners,
    IReadOnlyList<PhRosterRelationRowDto> Relations,
    PhRosterImportSummaryDto Summary,
    int MaxRows,
    int MaxFileBytes);

public sealed record PhRosterUnitRowDto(
    int RowNumber,
    string? Code,
    string? Tower,
    int? Floor,
    string? UnitType,
    decimal? Coefficient,
    string? Estado,
    string Classification,
    string Status,
    IReadOnlyList<string> Issues,
    bool Included);

public sealed record PhRosterOwnerRowDto(
    int RowNumber,
    string? IdType,
    string? Identification,
    string? FirstName,
    string? LastName,
    string? DisplayName,
    string? Email,
    string? Phone,
    string? Estado,
    string Classification,
    string Status,
    IReadOnlyList<string> Issues,
    bool Included);

public sealed record PhRosterRelationRowDto(
    int RowNumber,
    string? Identification,
    string? Email,
    string? UnitCode,
    decimal? SharePercent,
    string? Estado,
    string Classification,
    string Status,
    IReadOnlyList<string> Issues,
    bool Included);

public sealed record PhRosterImportSummaryDto(
    int UnitsNew,
    int UnitsExisting,
    int UnitsUpdates,
    int UnitsErrors,
    int OwnersNew,
    int OwnersExisting,
    int OwnersUpdates,
    int OwnersErrors,
    int RelationsNew,
    int RelationsExisting,
    int RelationsUpdates,
    int RelationsErrors,
    decimal CoefficientCurrent,
    decimal CoefficientFileNew,
    decimal CoefficientProjected,
    decimal CoefficientDelta,
    decimal ExpectedTotal,
    bool CanCommit,
    bool ActiveAssemblyBlocked,
    string? ActiveAssemblyMessage,
    IReadOnlyList<string> Warnings);

public sealed record PhRosterImportPatchRequest(
    Guid SessionId,
    string Sheet,
    int RowNumber,
    string? Code = null,
    string? Tower = null,
    int? Floor = null,
    string? UnitType = null,
    decimal? Coefficient = null,
    string? Estado = null,
    string? IdType = null,
    string? Identification = null,
    string? FirstName = null,
    string? LastName = null,
    string? DisplayName = null,
    string? Email = null,
    string? Phone = null,
    string? UnitCode = null,
    decimal? SharePercent = null,
    bool? Included = null);

public sealed record PhRosterImportExcludeRequest(
    Guid SessionId,
    string Sheet,
    int RowNumber,
    bool Included = false);

public sealed record PhRosterImportCommitRequest(
    Guid SessionId,
    string Mode,
    bool ConfirmUpdate = false,
    string? ClientRequestId = null,
    string? ConfirmPhName = null);

public sealed record PhRosterImportCommitResultDto(
    Guid SessionId,
    int UnitsCreated,
    int UnitsUpdated,
    int OwnersCreated,
    int OwnersUpdated,
    int OwnershipsCreated,
    bool IdempotentReplay = false);
