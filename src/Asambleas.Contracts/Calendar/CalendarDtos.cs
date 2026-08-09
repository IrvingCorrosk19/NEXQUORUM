namespace Asambleas.Contracts.Calendar;

public sealed record CalendarEventDto(
    Guid AssemblyId,
    Guid PropertyHorizontalId,
    string PropertyHorizontalName,
    string TimeZoneId,
    string Title,
    string AssemblyKind,
    string Modality,
    string Status,
    string CalendarStatus,
    DateTimeOffset ScheduledAtUtc,
    DateTimeOffset EstimatedEndAtUtc,
    DateTimeOffset? ScheduledLocalHint,
    string? LocationText,
    int JoinWindowMinutesBefore,
    bool CanJoin,
    DateTimeOffset? JoinOpensAtUtc,
    bool WasRescheduled,
    int ScheduleVersion,
    string? ConvocationStatus,
    int ParticipantCount,
    int ConfirmedCount,
    string CountdownLabel,
    bool CanReschedule,
    bool CanCancel,
    bool CanManage);

public sealed record CalendarListResponse(
    IReadOnlyList<CalendarEventDto> Events,
    DateTimeOffset RangeFromUtc,
    DateTimeOffset RangeToUtc);

public sealed record NextAssemblyDto(
    CalendarEventDto? Next,
    string RoleView);

public sealed record RescheduleImpactDto(
    Guid AssemblyId,
    DateTimeOffset CurrentScheduledAtUtc,
    DateTimeOffset ProposedScheduledAtUtc,
    int ParticipantCount,
    int ConvocationsAffected,
    int PendingReminders,
    int VirtualRooms,
    bool HasSentConvocation,
    int LatestConvocationVersion,
    IReadOnlyList<CalendarConflictDto> Conflicts,
    IReadOnlyList<string> Notes);

public sealed record CalendarConflictDto(
    Guid AssemblyId,
    string Title,
    DateTimeOffset ScheduledAtUtc,
    DateTimeOffset EstimatedEndAtUtc,
    string PropertyHorizontalName);

public sealed record ScheduleAssemblyRequest(
    Guid PropertyHorizontalId,
    string Title,
    string Modality,
    DateTimeOffset ScheduledAtUtc,
    DateTimeOffset? EstimatedEndAtUtc,
    decimal RequiredQuorumPercent,
    string? AssemblyKind,
    string? LocationText,
    string? Notes,
    int? JoinWindowMinutesBefore,
    bool PublishAsScheduled = true);

public sealed record RescheduleAssemblyRequest(
    DateTimeOffset NewScheduledAtUtc,
    DateTimeOffset? NewEstimatedEndAtUtc,
    string Reason,
    bool NotifyParticipants = false,
    uint? ExpectedRowVersion = null);

public sealed record CancelAssemblyRequest(
    string Reason,
    bool NotifyParticipants = false,
    uint? ExpectedRowVersion = null);

public sealed record ScheduleChangeDto(
    Guid Id,
    Guid AssemblyId,
    DateTimeOffset OriginalScheduledAtUtc,
    DateTimeOffset NewScheduledAtUtc,
    string Reason,
    Guid ChangedByUserId,
    DateTimeOffset ChangedAtUtc,
    string NotificationStatus,
    int ScheduleVersionAfter,
    string ImpactJson);

public sealed record AssemblyIcsLinksDto(
    Guid AssemblyId,
    string IcsDownloadPath,
    string GoogleCalendarUrl,
    string OutlookCalendarUrl);
