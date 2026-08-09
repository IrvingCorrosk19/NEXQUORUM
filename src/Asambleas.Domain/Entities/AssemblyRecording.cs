namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class AssemblyRecording : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public AssemblyRecordingStatus Status { get; set; } = AssemblyRecordingStatus.Starting;

    public DateTimeOffset? StartedAtUtc { get; set; }

    public DateTimeOffset? EndedAtUtc { get; set; }

    public int? DurationSeconds { get; set; }

    public long? FileSizeBytes { get; set; }

    public string? MimeType { get; set; }

    /// <summary>Internal object key — never expose raw to browsers.</summary>
    public string? StorageKey { get; set; }

    public Guid? CreatedByUserId { get; set; }

    public string? ChecksumSha256 { get; set; }

    public DateTimeOffset? RetentionUntilUtc { get; set; }

    /// <summary>LiveKit egress id when provider = LiveKit.</summary>
    public string? ProviderEgressId { get; set; }

    public string Provider { get; set; } = "None";

    public string? FailureReason { get; set; }

    public string? DisplayFileName { get; set; }

    public string RoomName { get; set; } = string.Empty;
}

/// <summary>Recording policy snapshot per property horizontal.</summary>
public class PropertyRecordingPolicy : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public bool RecordingEnabled { get; set; } = true;

    public AssemblyRecordingMode Mode { get; set; } = AssemblyRecordingMode.Manual;

    public AssemblyRecordingVisibility DownloadVisibility { get; set; } =
        AssemblyRecordingVisibility.AuthorizedParticipants;

    public int RetentionDays { get; set; } = 365;

    public string NoticeText { get; set; } =
        "Esta sesión puede ser grabada para fines de evidencia institucional de la asamblea. Al continuar, usted reconoce el aviso de grabación.";

    public bool RequireNoticeAcknowledgement { get; set; } = true;
}

public class RecordingNoticeAcceptance : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid UserId { get; set; }

    public DateTimeOffset AcceptedAtUtc { get; set; }

    public string NoticeVersion { get; set; } = "v1";

    public string? ClientUserAgent { get; set; }
}
