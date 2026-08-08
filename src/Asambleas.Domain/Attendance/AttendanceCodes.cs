namespace Asambleas.Domain.Attendance;

/// <summary>Stable machine-readable codes for attendance / accreditation / representation.</summary>
public static class AttendanceCodes
{
    public const string AlreadyCheckedIn = "ALREADY_CHECKED_IN";
    public const string RepresentationConflict = "REPRESENTATION_CONFLICT";
    public const string PowerNotApproved = "POWER_NOT_APPROVED";
    public const string NoEligibleRepresentation = "NO_ELIGIBLE_REPRESENTATION";
    public const string NotAccredited = "NOT_ACCREDITED";
    public const string Unauthorized = "UNAUTHORIZED_ACCREDITATION";
    public const string InvalidUnit = "INVALID_UNIT";
    public const string AssemblyNotOpen = "ASSEMBLY_NOT_OPEN_FOR_CHECKIN";
}
