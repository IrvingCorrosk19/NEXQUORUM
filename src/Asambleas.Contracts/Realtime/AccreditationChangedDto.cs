namespace Asambleas.Contracts.Realtime;

/// <summary>
/// Real-time accreditation lifecycle notice for the affected participant (and desk observers).
/// </summary>
public sealed record AccreditationChangedDto(
    Guid AssemblyId,
    Guid UserId,
    bool IsAccredited,
    string AttendanceStatus,
    decimal EffectiveCoefficientPercent,
    string Message,
    string? PreviousAttendanceStatus = null,
    Guid? AccreditedByUserId = null,
    DateTimeOffset? AccreditedAtUtc = null,
    string? Reason = null);
