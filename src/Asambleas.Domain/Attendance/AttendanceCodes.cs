namespace Asambleas.Domain.Attendance;

/// <summary>Stable machine-readable codes for attendance / accreditation / representation.</summary>
public static class AttendanceCodes
{
    public const string AlreadyCheckedIn = "ALREADY_CHECKED_IN";
    public const string RepresentationConflict = "REPRESENTATION_CONFLICT";
    public const string PowerNotApproved = "POWER_NOT_APPROVED";
    public const string NoEligibleRepresentation = "NO_ELIGIBLE_REPRESENTATION";
    public const string OwnerDraft = "OWNER_DRAFT";
    public const string OwnerInactive = "OWNER_INACTIVE";
    public const string OwnerMissingUnits = "OWNER_MISSING_UNITS";
    public const string NotAccredited = "NOT_ACCREDITED";
    public const string Unauthorized = "UNAUTHORIZED_ACCREDITATION";
    /// <summary>Owner (or any caller without attendance:manage) attempted self-accreditation.</summary>
    public const string SelfAccreditationForbidden = "SELF_ACCREDITATION_FORBIDDEN";
    public const string InvalidUnit = "INVALID_UNIT";
    public const string AssemblyNotOpen = "ASSEMBLY_NOT_OPEN_FOR_CHECKIN";
    public const string BulkConfirmAbsentRequired = "BULK_CONFIRM_ABSENT_REQUIRED";
    public const string DeaccreditBlockedVoting = "DEACCREDIT_BLOCKED_VOTING_OPEN";
    public const string DeaccreditBlockedInProgress = "DEACCREDIT_BLOCKED_ASSEMBLY_IN_PROGRESS";
    public const string NotAccreditedForDeaccredit = "NOT_ACCREDITED";
    public const string CoefficientConfigurationInvalid = "COEFFICIENT_CONFIGURATION_INVALID";
    public const string RequiresMesaValidation = "REQUIRES_MESA_VALIDATION";
}
