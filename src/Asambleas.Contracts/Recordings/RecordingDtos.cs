namespace Asambleas.Contracts.Recordings;

public sealed record AssemblyRecordingDto(
    Guid Id,
    Guid AssemblyId,
    string Status,
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? EndedAtUtc,
    int? DurationSeconds,
    long? FileSizeBytes,
    string? FileSizeLabel,
    string? MimeType,
    string? DisplayFileName,
    string Provider,
    string? FailureReason,
    bool CanPlay,
    bool CanDownload);

public sealed record RecordingPolicyDto(
    bool RecordingEnabled,
    string Mode,
    string DownloadVisibility,
    int RetentionDays,
    string NoticeText,
    bool RequireNoticeAcknowledgement,
    bool CurrentUserAcceptedNotice);

public sealed record AcknowledgeRecordingNoticeRequest(string? NoticeVersion = null);

public sealed record SessionExpedienteDto(
    Guid AssemblyId,
    string AssemblyTitle,
    string Status,
    DateTimeOffset? ScheduledStartAtUtc,
    DateTimeOffset? CompletedAtUtc,
    RecordingPolicyDto Policy,
    IReadOnlyList<AssemblyRecordingDto> Recordings,
    bool CanDownloadActa,
    bool CanDownloadAttendance,
    bool CanDownloadQuorum,
    bool CanDownloadVoting,
    bool CanDownloadDecisions,
    bool CanDownloadEvidencePackage,
    bool CanControlRecording,
    IReadOnlyList<SessionTimelineEventDto> Timeline);

public sealed record SessionTimelineEventDto(
    DateTimeOffset OccurredAtUtc,
    string EventType,
    string Label,
    double? OffsetSecondsFromRecordingStart);

public sealed record RecordingStorageStatsDto(
    int RecordingCount,
    long TotalBytes,
    string TotalSizeLabel,
    double TotalHours);
