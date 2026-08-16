namespace Asambleas.Application.Recording;

using System.Security.Cryptography;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Recordings;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

public sealed class RecordingService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly IMeetingRecordingProvider _provider;
    private readonly IAssemblyRecordingStorage _storage;

    public RecordingService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime,
        IMeetingRecordingProvider provider,
        IAssemblyRecordingStorage storage)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
        _provider = provider;
        _storage = storage;
    }

    public async Task<PropertyRecordingPolicy> GetOrCreatePolicyAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await LoadAssemblyAsync(assemblyId, tracking: false, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var policy = await _db.PropertyRecordingPolicies
            .FirstOrDefaultAsync(
                p => p.PropertyHorizontalId == assembly.PropertyHorizontalId,
                cancellationToken);

        if (policy is not null)
        {
            return policy;
        }

        policy = new PropertyRecordingPolicy
        {
            TenantId = assembly.TenantId,
            PropertyHorizontalId = assembly.PropertyHorizontalId
        };
        _db.PropertyRecordingPolicies.Add(policy);
        await _db.SaveChangesAsync(cancellationToken);
        return policy;
    }

    public async Task<RecordingPolicyDto> GetPolicyDtoAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var policy = await GetOrCreatePolicyAsync(assemblyId, cancellationToken);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var accepted = await _db.RecordingNoticeAcceptances
            .AsNoTracking()
            .AnyAsync(
                a => a.AssemblyId == assemblyId
                     && a.UserId == userId
                     && a.NoticeVersion == ResolveNoticeVersion(policy),
                cancellationToken);

        return ToPolicyDto(policy, accepted);
    }

    public async Task AcknowledgeNoticeAsync(
        Guid assemblyId,
        string? noticeVersion,
        string? userAgent,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var assembly = await LoadAssemblyAsync(assemblyId, tracking: false, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var policy = await GetOrCreatePolicyAsync(assemblyId, cancellationToken);
        var version = string.IsNullOrWhiteSpace(noticeVersion)
            ? ResolveNoticeVersion(policy)
            : noticeVersion.Trim();

        var existing = await _db.RecordingNoticeAcceptances
            .FirstOrDefaultAsync(
                a => a.AssemblyId == assemblyId && a.UserId == userId && a.NoticeVersion == version,
                cancellationToken);

        if (existing is null)
        {
            _db.RecordingNoticeAcceptances.Add(new RecordingNoticeAcceptance
            {
                TenantId = assembly.TenantId,
                AssemblyId = assemblyId,
                UserId = userId,
                AcceptedAtUtc = DateTimeOffset.UtcNow,
                NoticeVersion = version,
                ClientUserAgent = Truncate(userAgent, 512)
            });
            await _db.SaveChangesAsync(cancellationToken);
        }

        await _audit.WriteAsync(
            AuditEventType.RecordingNoticeAccepted,
            assemblyId,
            metadata: new { noticeVersion = version },
            cancellationToken: cancellationToken);
    }

    public async Task<AssemblyRecordingDto> StartRecordingAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsurePermission(Permissions.RecordingControl);

        var assembly = await LoadAssemblyAsync(assemblyId, tracking: false, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is not (AssemblyStatus.CheckIn or AssemblyStatus.InProgress or AssemblyStatus.Paused))
        {
            throw new DomainException(
                "ASSEMBLY_NOT_LIVE",
                $"Recording can only start while assembly is CheckIn, InProgress, or Paused (current: {assembly.Status}).");
        }

        var policy = await GetOrCreatePolicyAsync(assemblyId, cancellationToken);
        if (!policy.RecordingEnabled || policy.Mode == AssemblyRecordingMode.Disabled)
        {
            throw new DomainException("Recording is disabled for this property.");
        }

        if (!await _provider.IsAvailableAsync(cancellationToken))
        {
            throw new DomainException("Recording provider is not available.");
        }

        var active = await _db.AssemblyRecordings
            .AsNoTracking()
            .Where(r => r.AssemblyId == assemblyId
                        && (r.Status == AssemblyRecordingStatus.Starting
                            || r.Status == AssemblyRecordingStatus.Recording
                            || r.Status == AssemblyRecordingStatus.Processing))
            .OrderByDescending(r => r.StartedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        if (active is not null)
        {
            // Idempotent start: return the in-flight recording instead of creating a second one.
            return await ToDtoAsync(active, cancellationToken);
        }

        var recordingId = Guid.NewGuid();
        var roomName = $"assembly-{assemblyId:N}";
        var storageKey = $"{assembly.TenantId:N}/{assemblyId:N}/{recordingId:N}.mp4";
        var now = DateTimeOffset.UtcNow;
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var recording = new AssemblyRecording
        {
            Id = recordingId,
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            Status = AssemblyRecordingStatus.Starting,
            StartedAtUtc = now,
            CreatedByUserId = userId,
            RoomName = roomName,
            StorageKey = storageKey,
            MimeType = "video/mp4",
            RetentionUntilUtc = now.AddDays(Math.Max(1, policy.RetentionDays))
        };
        _db.AssemblyRecordings.Add(recording);
        await _db.SaveChangesAsync(cancellationToken);

        // Notify room immediately so clients see REC without waiting for egress start.
        var startingDto = await ToDtoAsync(recording, cancellationToken);
        await _realtime.PublishRecordingUpdatedAsync(assemblyId, startingDto, cancellationToken);

        try
        {
            var start = await _provider.StartAsync(
                assembly.TenantId,
                assemblyId,
                recordingId,
                roomName,
                storageKey,
                cancellationToken);

            recording.Provider = start.Provider;
            recording.ProviderEgressId = start.EgressId;
            recording.StorageKey = start.StorageKey;
            recording.MimeType = start.MimeType;
            recording.DisplayFileName = start.DisplayFileName;

            // Lifecycle: always enter RECORDING after a successful provider start.
            // Synthetic may already have bytes on disk, but Ready is reserved for Stop/finalize
            // so the room UI can show GRABANDO → Detener until the operator stops.
            recording.Status = AssemblyRecordingStatus.Recording;
            await _db.SaveChangesAsync(cancellationToken);

            await _audit.WriteAsync(
                AuditEventType.RecordingStarted,
                assemblyId,
                correlationId: recordingId,
                metadata: new { recordingId, provider = recording.Provider, egressId = recording.ProviderEgressId },
                cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            recording.Status = AssemblyRecordingStatus.Failed;
            recording.FailureReason = Truncate(ex.Message, 2000);
            recording.EndedAtUtc = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);

            await _audit.WriteAsync(
                AuditEventType.RecordingFailed,
                assemblyId,
                correlationId: recordingId,
                metadata: new { recordingId, reason = recording.FailureReason },
                cancellationToken: cancellationToken);

            var failedDto = await ToDtoAsync(recording, cancellationToken);
            await _realtime.PublishRecordingUpdatedAsync(assemblyId, failedDto, cancellationToken);
            throw new DomainException("Failed to start recording.", ex);
        }

        var dto = await ToDtoAsync(recording, cancellationToken);
        await _realtime.PublishRecordingUpdatedAsync(assemblyId, dto, cancellationToken);
        return dto;
    }

    public async Task<AssemblyRecordingDto> StopRecordingAsync(
        Guid assemblyId,
        Guid recordingId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsurePermission(Permissions.RecordingControl);

        var recording = await LoadRecordingAsync(assemblyId, recordingId, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, recording.TenantId);

        // Idempotent stop: already finalizing / ready → return current state.
        if (recording.Status is AssemblyRecordingStatus.Processing or AssemblyRecordingStatus.Ready)
        {
            return await ToDtoAsync(recording, cancellationToken);
        }

        if (recording.Status is not (AssemblyRecordingStatus.Recording or AssemblyRecordingStatus.Starting))
        {
            throw new DomainException($"Cannot stop recording in status '{recording.Status}'.");
        }

        var storageKey = recording.StorageKey
                         ?? throw new DomainException("Recording storage key is missing.");

        // Show "Processing" in the room immediately while egress stop runs.
        recording.Status = AssemblyRecordingStatus.Processing;
        recording.EndedAtUtc = DateTimeOffset.UtcNow;
        if (recording.StartedAtUtc is DateTimeOffset startedEarly)
        {
            recording.DurationSeconds = (int)Math.Max(0, (recording.EndedAtUtc.Value - startedEarly).TotalSeconds);
        }
        await _db.SaveChangesAsync(cancellationToken);
        await _realtime.PublishRecordingUpdatedAsync(
            assemblyId,
            await ToDtoAsync(recording, cancellationToken),
            cancellationToken);

        try
        {
            var stop = await _provider.StopAsync(recording.ProviderEgressId, storageKey, cancellationToken);
            recording.EndedAtUtc = DateTimeOffset.UtcNow;
            if (recording.StartedAtUtc is DateTimeOffset started)
            {
                recording.DurationSeconds = (int)Math.Max(0, (recording.EndedAtUtc.Value - started).TotalSeconds);
            }

            if (stop.ProcessingAsync)
            {
                recording.Status = AssemblyRecordingStatus.Processing;
                await _db.SaveChangesAsync(cancellationToken);
            }
            else
            {
                await MarkReadyAsync(recording, cancellationToken);
            }

            await _audit.WriteAsync(
                AuditEventType.RecordingStopped,
                assemblyId,
                correlationId: recordingId,
                metadata: new { recordingId, processing = stop.ProcessingAsync },
                cancellationToken: cancellationToken);

            if (recording.Status == AssemblyRecordingStatus.Ready)
            {
                await _audit.WriteAsync(
                    AuditEventType.RecordingReady,
                    assemblyId,
                    correlationId: recordingId,
                    metadata: new { recordingId, recording.ChecksumSha256, recording.FileSizeBytes },
                    cancellationToken: cancellationToken);
            }
        }
        catch (Exception ex)
        {
            recording.Status = AssemblyRecordingStatus.Failed;
            recording.FailureReason = Truncate(ex.Message, 2000);
            recording.EndedAtUtc ??= DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);

            await _audit.WriteAsync(
                AuditEventType.RecordingFailed,
                assemblyId,
                correlationId: recordingId,
                metadata: new { recordingId, reason = recording.FailureReason },
                cancellationToken: cancellationToken);

            var failedDto = await ToDtoAsync(recording, cancellationToken);
            await _realtime.PublishRecordingUpdatedAsync(assemblyId, failedDto, cancellationToken);
            throw new DomainException("Failed to stop recording.", ex);
        }

        var dto = await ToDtoAsync(recording, cancellationToken);
        await _realtime.PublishRecordingUpdatedAsync(assemblyId, dto, cancellationToken);
        return dto;
    }

    /// <summary>
    /// Stops any in-flight recording before assembly completion so segments are not orphaned.
    /// Safe/no-op when none are active. Does not require RecordingControl (system finalize).
    /// </summary>
    public async Task FinalizeActiveRecordingsAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await LoadAssemblyAsync(assemblyId, tracking: false, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var activeIds = await _db.AssemblyRecordings
            .Where(r => r.AssemblyId == assemblyId
                        && (r.Status == AssemblyRecordingStatus.Starting
                            || r.Status == AssemblyRecordingStatus.Recording
                            || r.Status == AssemblyRecordingStatus.Processing))
            .Select(r => r.Id)
            .ToListAsync(cancellationToken);

        foreach (var id in activeIds)
        {
            var row = await _db.AssemblyRecordings
                .FirstOrDefaultAsync(r => r.Id == id && r.AssemblyId == assemblyId, cancellationToken);
            if (row is null)
            {
                continue;
            }

            if (row.Status is AssemblyRecordingStatus.Processing)
            {
                // Already stopping — wait for provider then seal Ready if possible.
                try
                {
                    var storageKey = row.StorageKey ?? string.Empty;
                    var stop = await _provider.StopAsync(row.ProviderEgressId, storageKey, cancellationToken);
                    if (!stop.ProcessingAsync)
                    {
                        await MarkReadyAsync(row, cancellationToken);
                    }
                }
                catch
                {
                    row.Status = AssemblyRecordingStatus.Failed;
                    row.FailureReason = Truncate("Failed to finalize recording on assembly complete.", 2000);
                    row.EndedAtUtc ??= DateTimeOffset.UtcNow;
                    await _db.SaveChangesAsync(cancellationToken);
                }

                continue;
            }

            if (row.Status is not (AssemblyRecordingStatus.Recording or AssemblyRecordingStatus.Starting))
            {
                continue;
            }

            var storage = row.StorageKey
                          ?? throw new DomainException("Recording storage key is missing.");
            row.Status = AssemblyRecordingStatus.Processing;
            row.EndedAtUtc = DateTimeOffset.UtcNow;
            if (row.StartedAtUtc is DateTimeOffset startedEarly)
            {
                row.DurationSeconds = (int)Math.Max(0, (row.EndedAtUtc.Value - startedEarly).TotalSeconds);
            }

            await _db.SaveChangesAsync(cancellationToken);
            await _realtime.PublishRecordingUpdatedAsync(
                assemblyId,
                await ToDtoAsync(row, cancellationToken),
                cancellationToken);

            try
            {
                var stop = await _provider.StopAsync(row.ProviderEgressId, storage, cancellationToken);
                row.EndedAtUtc = DateTimeOffset.UtcNow;
                if (row.StartedAtUtc is DateTimeOffset started)
                {
                    row.DurationSeconds = (int)Math.Max(0, (row.EndedAtUtc.Value - started).TotalSeconds);
                }

                if (stop.ProcessingAsync)
                {
                    row.Status = AssemblyRecordingStatus.Processing;
                    await _db.SaveChangesAsync(cancellationToken);
                }
                else
                {
                    await MarkReadyAsync(row, cancellationToken);
                }

                await _audit.WriteAsync(
                    AuditEventType.RecordingStopped,
                    assemblyId,
                    correlationId: id,
                    metadata: new { recordingId = id, reason = "AssemblyCompleted" },
                    cancellationToken: cancellationToken);

                if (row.Status == AssemblyRecordingStatus.Ready)
                {
                    await _audit.WriteAsync(
                        AuditEventType.RecordingReady,
                        assemblyId,
                        correlationId: id,
                        metadata: new { recordingId = id, row.ChecksumSha256, row.FileSizeBytes },
                        cancellationToken: cancellationToken);
                }
            }
            catch (Exception ex)
            {
                row.Status = AssemblyRecordingStatus.Failed;
                row.FailureReason = Truncate(ex.Message, 2000);
                row.EndedAtUtc ??= DateTimeOffset.UtcNow;
                await _db.SaveChangesAsync(cancellationToken);
                await _audit.WriteAsync(
                    AuditEventType.RecordingFailed,
                    assemblyId,
                    correlationId: id,
                    metadata: new { recordingId = id, reason = row.FailureReason, onComplete = true },
                    cancellationToken: cancellationToken);
            }

            await _realtime.PublishRecordingUpdatedAsync(
                assemblyId,
                await ToDtoAsync(row, cancellationToken),
                cancellationToken);
        }
    }

    public async Task<AssemblyRecordingDto> RefreshStatusAsync(
        Guid assemblyId,
        Guid recordingId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var recording = await LoadRecordingAsync(assemblyId, recordingId, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, recording.TenantId);

        if (recording.Status is AssemblyRecordingStatus.Ready or AssemblyRecordingStatus.Deleted)
        {
            return await ToDtoAsync(recording, cancellationToken);
        }

        var storageKey = recording.StorageKey ?? string.Empty;
        var status = await _provider.GetStatusAsync(recording.ProviderEgressId, storageKey, cancellationToken);
        var previous = recording.Status;

        if (string.Equals(status.Status, "Ready", StringComparison.OrdinalIgnoreCase))
        {
            if (status.FileSizeBytes is long size)
            {
                recording.FileSizeBytes = size;
            }

            await MarkReadyAsync(recording, cancellationToken);
            if (previous != AssemblyRecordingStatus.Ready)
            {
                await _audit.WriteAsync(
                    AuditEventType.RecordingReady,
                    assemblyId,
                    correlationId: recordingId,
                    metadata: new { recordingId, recording.ChecksumSha256, recording.FileSizeBytes },
                    cancellationToken: cancellationToken);
            }
        }
        else if (string.Equals(status.Status, "Failed", StringComparison.OrdinalIgnoreCase))
        {
            recording.Status = AssemblyRecordingStatus.Failed;
            recording.FailureReason = Truncate(status.FailureReason ?? "Provider reported failure.", 2000);
            recording.EndedAtUtc ??= DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);

            await _audit.WriteAsync(
                AuditEventType.RecordingFailed,
                assemblyId,
                correlationId: recordingId,
                metadata: new { recordingId, reason = recording.FailureReason },
                cancellationToken: cancellationToken);
        }
        else if (string.Equals(status.Status, "Recording", StringComparison.OrdinalIgnoreCase))
        {
            recording.Status = AssemblyRecordingStatus.Recording;
            await _db.SaveChangesAsync(cancellationToken);
        }
        else
        {
            recording.Status = AssemblyRecordingStatus.Processing;
            await _db.SaveChangesAsync(cancellationToken);
        }

        var dto = await ToDtoAsync(recording, cancellationToken);
        if (previous != recording.Status)
        {
            await _realtime.PublishRecordingUpdatedAsync(assemblyId, dto, cancellationToken);
        }

        return dto;
    }

    public async Task<IReadOnlyList<AssemblyRecordingDto>> ListRecordingsAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await LoadAssemblyAsync(assemblyId, tracking: false, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var rows = await _db.AssemblyRecordings
            .AsNoTracking()
            .Where(r => r.AssemblyId == assemblyId && r.Status != AssemblyRecordingStatus.Deleted)
            .OrderByDescending(r => r.StartedAtUtc)
            .ToListAsync(cancellationToken);

        var result = new List<AssemblyRecordingDto>(rows.Count);
        foreach (var row in rows)
        {
            result.Add(await ToDtoAsync(row, cancellationToken));
        }

        return result;
    }

    public async Task<SessionExpedienteDto> GetExpedienteAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        if (!HasPermission(Permissions.ExpedienteView) && !HasPermission(Permissions.ExpedienteDownload))
        {
            throw new DomainException($"Missing permission '{Permissions.ExpedienteView}'.");
        }

        var assembly = await LoadAssemblyAsync(assemblyId, tracking: false, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var policyDto = await GetPolicyDtoAsync(assemblyId, cancellationToken);
        var recordings = await ListRecordingsAsync(assemblyId, cancellationToken);

        var primaryRecording = recordings
            .Where(r => r.StartedAtUtc is not null)
            .OrderBy(r => r.StartedAtUtc)
            .FirstOrDefault();
        var recordingStart = primaryRecording?.StartedAtUtc;

        var auditEvents = await _db.AuditEvents
            .AsNoTracking()
            .Where(e => e.AssemblyId == assemblyId)
            .OrderBy(e => e.OccurredAtUtc)
            .Take(500)
            .ToListAsync(cancellationToken);

        var timeline = auditEvents
            .Select(e =>
            {
                double? offset = null;
                Guid? recordingId = null;
                if (recordingStart is DateTimeOffset start && primaryRecording is not null)
                {
                    offset = Math.Round((e.OccurredAtUtc - start).TotalSeconds, 1);
                    if (offset >= 0)
                    {
                        recordingId = primaryRecording.Id;
                    }
                }

                return new SessionTimelineEventDto(
                    e.OccurredAtUtc,
                    e.EventType,
                    HumanizeAudit(e.EventType),
                    offset,
                    recordingId);
            })
            .ToList();

        DateTimeOffset? completedAt = auditEvents
            .Where(e => e.EventType == AuditEventType.AssemblyCompleted)
            .Select(e => (DateTimeOffset?)e.OccurredAtUtc)
            .FirstOrDefault();

        var canDownloadDocs = HasPermission(Permissions.ExpedienteDownload);
        var canViewDocs = HasPermission(Permissions.ExpedienteView) || canDownloadDocs;

        return new SessionExpedienteDto(
            assemblyId,
            assembly.Title,
            assembly.Status.ToString(),
            assembly.ScheduledAtUtc,
            completedAt,
            policyDto,
            recordings,
            CanDownloadActa: canViewDocs,
            CanDownloadAttendance: canViewDocs,
            CanDownloadQuorum: canViewDocs,
            CanDownloadVoting: canViewDocs,
            CanDownloadDecisions: canViewDocs,
            CanDownloadEvidencePackage: canDownloadDocs,
            CanControlRecording: HasPermission(Permissions.RecordingControl),
            timeline);
    }

    public async Task AuthorizePlayOrDownloadAsync(
        Guid recordingId,
        bool forDownload = false,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var recording = await _db.AssemblyRecordings
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == recordingId, cancellationToken)
            ?? throw new DomainException($"Recording '{recordingId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, recording.TenantId);

        if (recording.Status != AssemblyRecordingStatus.Ready)
        {
            throw new DomainException("Recording is not ready for playback or download.");
        }

        var assembly = await LoadAssemblyAsync(recording.AssemblyId, tracking: false, cancellationToken);
        var policy = await GetOrCreatePolicyAsync(recording.AssemblyId, cancellationToken);

        switch (policy.DownloadVisibility)
        {
            case AssemblyRecordingVisibility.AdminOnly:
                if (!HasPermission(Permissions.AuditView) || !HasPermission(Permissions.RecordingDownload))
                {
                    throw new DomainException("Recording access requires audit:view and recording:download.");
                }

                break;

            case AssemblyRecordingVisibility.BoardOnly:
                if (!IsBoardRole() && !HasPermission(Permissions.RecordingDownload))
                {
                    throw new DomainException("Recording access is limited to board officers or recording:download.");
                }

                break;

            case AssemblyRecordingVisibility.AuthorizedParticipants:
            default:
            {
                var isParticipant = await _db.AssemblyParticipants
                    .AsNoTracking()
                    .AnyAsync(p => p.AssemblyId == recording.AssemblyId && p.UserId == userId, cancellationToken);
                if (!isParticipant)
                {
                    throw new DomainException("Only assembly participants may access this recording.");
                }

                if (forDownload)
                {
                    if (!HasPermission(Permissions.RecordingDownload))
                    {
                        throw new DomainException($"Missing permission '{Permissions.RecordingDownload}'.");
                    }
                }
                else if (!HasPermission(Permissions.RecordingView) && !HasPermission(Permissions.RecordingDownload))
                {
                    throw new DomainException($"Missing permission '{Permissions.RecordingView}'.");
                }

                break;
            }
        }

        if (forDownload && policy.DownloadVisibility != AssemblyRecordingVisibility.AuthorizedParticipants)
        {
            // Board/AdminAlready gated; still require download permission unless board role under BoardOnly.
            if (policy.DownloadVisibility == AssemblyRecordingVisibility.BoardOnly)
            {
                if (!IsBoardRole() && !HasPermission(Permissions.RecordingDownload))
                {
                    throw new DomainException($"Missing permission '{Permissions.RecordingDownload}'.");
                }
            }
            else if (!HasPermission(Permissions.RecordingDownload))
            {
                throw new DomainException($"Missing permission '{Permissions.RecordingDownload}'.");
            }
        }

        _ = assembly;
    }

    public async Task<(Stream Stream, long Length, string ContentType, string FileName)> OpenRecordingStreamAsync(
        Guid assemblyId,
        Guid recordingId,
        bool forDownload = false,
        CancellationToken cancellationToken = default)
    {
        await AuthorizePlayOrDownloadAsync(recordingId, forDownload, cancellationToken);

        var recording = await _db.AssemblyRecordings
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == recordingId, cancellationToken)
            ?? throw new DomainException($"Recording '{recordingId}' was not found.");

        if (recording.AssemblyId != assemblyId)
        {
            throw new DomainException("RECORDING_ASSEMBLY_MISMATCH", "Recording does not belong to this assembly.");
        }

        TenantGuard.EnsureTenantMatch(_currentTenant, recording.TenantId);

        if (string.IsNullOrWhiteSpace(recording.StorageKey))
        {
            throw new DomainException("Recording file is not available.");
        }

        var (stream, length, contentType) = await _storage.OpenReadWithMetaAsync(
            recording.StorageKey,
            cancellationToken);

        if (length <= 0)
        {
            await stream.DisposeAsync();
            throw new DomainException(
                "RECORDING_FILE_EMPTY",
                "El archivo de grabación está vacío o aún no se guardó en el servidor.");
        }

        var fileName = string.IsNullOrWhiteSpace(recording.DisplayFileName)
            ? $"recording-{recordingId:N}.mp4"
            : recording.DisplayFileName;

        await _audit.WriteAsync(
            forDownload ? AuditEventType.RecordingDownloaded : AuditEventType.RecordingViewed,
            recording.AssemblyId,
            correlationId: recordingId,
            metadata: new { recordingId, forDownload },
            cancellationToken: cancellationToken);

        return (stream, length, contentType, fileName);
    }

    public async Task<RecordingStorageStatsDto> GetStorageStatsAsync(
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var rows = await _db.AssemblyRecordings
            .AsNoTracking()
            .Where(r => r.Status != AssemblyRecordingStatus.Deleted)
            .Select(r => new { r.FileSizeBytes, r.DurationSeconds })
            .ToListAsync(cancellationToken);

        long totalBytes = rows.Sum(r => r.FileSizeBytes ?? 0);
        double totalHours = rows.Sum(r => r.DurationSeconds ?? 0) / 3600d;

        return new RecordingStorageStatsDto(
            rows.Count,
            totalBytes,
            FormatBytes(totalBytes),
            Math.Round(totalHours, 2));
    }

    private async Task MarkReadyAsync(AssemblyRecording recording, CancellationToken cancellationToken)
    {
        recording.Status = AssemblyRecordingStatus.Ready;
        recording.EndedAtUtc ??= DateTimeOffset.UtcNow;
        if (recording.StartedAtUtc is DateTimeOffset started && recording.EndedAtUtc is DateTimeOffset ended)
        {
            recording.DurationSeconds = (int)Math.Max(0, (ended - started).TotalSeconds);
        }

        if (!string.IsNullOrWhiteSpace(recording.StorageKey)
            && await _storage.ExistsAsync(recording.StorageKey, cancellationToken))
        {
            await using var stream = await _storage.OpenReadAsync(recording.StorageKey, cancellationToken);
            if (stream.CanSeek)
            {
                recording.FileSizeBytes = stream.Length;
            }

            recording.ChecksumSha256 = await ComputeSha256HexAsync(stream, cancellationToken);
            if (recording.FileSizeBytes is null && stream.CanSeek)
            {
                recording.FileSizeBytes = stream.Length;
            }
            else if (recording.FileSizeBytes is null)
            {
                try
                {
                    var meta = await _storage.OpenReadWithMetaAsync(recording.StorageKey, cancellationToken);
                    await using (meta.Stream)
                    {
                        recording.FileSizeBytes = meta.Length;
                    }
                }
                catch
                {
                    // size optional when provider did not report it
                }
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<AssemblyRecording> LoadRecordingAsync(
        Guid assemblyId,
        Guid recordingId,
        CancellationToken cancellationToken)
    {
        return await _db.AssemblyRecordings
                   .FirstOrDefaultAsync(r => r.Id == recordingId && r.AssemblyId == assemblyId, cancellationToken)
               ?? throw new DomainException($"Recording '{recordingId}' was not found.");
    }

    private async Task<AssemblyEntity> LoadAssemblyAsync(
        Guid assemblyId,
        bool tracking,
        CancellationToken cancellationToken)
    {
        IQueryable<AssemblyEntity> query = _db.Assemblies;
        if (!tracking)
        {
            query = query.AsNoTracking();
        }

        return await query.FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
               ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
    }

    private async Task<AssemblyRecordingDto> ToDtoAsync(
        AssemblyRecording recording,
        CancellationToken cancellationToken)
    {
        var canAccess = await TryAuthorizeAsync(recording, forDownload: false, cancellationToken);
        var canDownloadAuth = canAccess && await TryAuthorizeAsync(recording, forDownload: true, cancellationToken);
        var ready = recording.Status == AssemblyRecordingStatus.Ready;
        var filePresent = ready
            && !string.IsNullOrWhiteSpace(recording.StorageKey)
            && recording.FileSizeBytes is not 0
            && await _storage.ExistsAsync(recording.StorageKey!, cancellationToken);

        return new AssemblyRecordingDto(
            recording.Id,
            recording.AssemblyId,
            recording.Status.ToString(),
            recording.StartedAtUtc,
            recording.EndedAtUtc,
            recording.DurationSeconds,
            recording.FileSizeBytes,
            recording.FileSizeBytes is long b ? FormatBytes(b) : null,
            recording.MimeType,
            recording.DisplayFileName,
            recording.Provider,
            recording.FailureReason,
            CanPlay: ready && canAccess && filePresent,
            CanDownload: ready && canDownloadAuth && filePresent);
    }

    private async Task<bool> TryAuthorizeAsync(
        AssemblyRecording recording,
        bool forDownload,
        CancellationToken cancellationToken)
    {
        try
        {
            if (recording.Status != AssemblyRecordingStatus.Ready || _currentTenant.UserId is null)
            {
                return false;
            }

            var userId = _currentTenant.UserId.Value;
            var phId = await _db.Assemblies
                .AsNoTracking()
                .Where(a => a.Id == recording.AssemblyId)
                .Select(a => a.PropertyHorizontalId)
                .FirstOrDefaultAsync(cancellationToken);

            var policy = await _db.PropertyRecordingPolicies
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.PropertyHorizontalId == phId, cancellationToken);

            var visibility = policy?.DownloadVisibility ?? AssemblyRecordingVisibility.AuthorizedParticipants;

            return visibility switch
            {
                AssemblyRecordingVisibility.AdminOnly =>
                    HasPermission(Permissions.AuditView) && HasPermission(Permissions.RecordingDownload),
                AssemblyRecordingVisibility.BoardOnly =>
                    IsBoardRole() || HasPermission(Permissions.RecordingDownload),
                _ => await IsParticipantAsync(recording.AssemblyId, userId, cancellationToken)
                     && (forDownload
                         ? HasPermission(Permissions.RecordingDownload)
                         : HasPermission(Permissions.RecordingView) || HasPermission(Permissions.RecordingDownload))
            };
        }
        catch
        {
            return false;
        }
    }

    private Task<bool> IsParticipantAsync(Guid assemblyId, Guid userId, CancellationToken cancellationToken) =>
        _db.AssemblyParticipants
            .AsNoTracking()
            .AnyAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken);

    private bool IsBoardRole() =>
        _currentTenant.Roles.Any(r =>
            r is Roles.AssemblyPresident
                or Roles.AssemblySecretary
                or Roles.PHAdmin
                or Roles.TenantAdmin
                or Roles.PlatformAdmin);

    private void EnsurePermission(string permission)
    {
        if (!HasPermission(permission))
        {
            throw new DomainException($"Missing permission '{permission}'.");
        }
    }

    private bool HasPermission(string permission) =>
        _currentTenant.Permissions.Contains(permission, StringComparer.Ordinal)
        || RolePermissionMap.HasPermission(_currentTenant.Roles, permission);

    private static RecordingPolicyDto ToPolicyDto(PropertyRecordingPolicy policy, bool accepted) =>
        new(
            policy.RecordingEnabled,
            policy.Mode.ToString(),
            policy.DownloadVisibility.ToString(),
            policy.RetentionDays,
            policy.NoticeText,
            policy.RequireNoticeAcknowledgement,
            accepted);

    private static string ResolveNoticeVersion(PropertyRecordingPolicy policy)
    {
        var hash = Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(policy.NoticeText)))[..8];
        return $"v1-{hash}";
    }

    private static async Task<string> ComputeSha256HexAsync(Stream stream, CancellationToken cancellationToken)
    {
        if (stream.CanSeek)
        {
            stream.Position = 0;
        }

        var hash = await SHA256.HashDataAsync(stream, cancellationToken);
        if (stream.CanSeek)
        {
            stream.Position = 0;
        }

        return Convert.ToHexString(hash);
    }

    private static string FormatBytes(long bytes)
    {
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double value = bytes;
        var unit = 0;
        while (value >= 1024 && unit < units.Length - 1)
        {
            value /= 1024;
            unit++;
        }

        return $"{value:0.##} {units[unit]}";
    }

    private static string? Truncate(string? value, int max) =>
        value is null ? null : value.Length <= max ? value : value[..max];

    private static string HumanizeAudit(string eventType) => eventType switch
    {
        AuditEventType.RecordingStarted => "Grabación iniciada",
        AuditEventType.RecordingStopped => "Grabación detenida",
        AuditEventType.RecordingReady => "Grabación lista",
        AuditEventType.RecordingFailed => "Grabación fallida",
        AuditEventType.RecordingNoticeAccepted => "Aviso de grabación aceptado",
        AuditEventType.RecordingViewed => "Grabación visualizada",
        AuditEventType.RecordingDownloaded => "Grabación descargada",
        AuditEventType.AssemblyStarted => "Asamblea iniciada",
        AuditEventType.AssemblyCompleted => "Asamblea finalizada",
        AuditEventType.VotingOpened => "Votación abierta",
        AuditEventType.VotingClosed => "Votación cerrada",
        AuditEventType.QuorumReached => "Quórum alcanzado",
        AuditEventType.CheckIn => "Check-in",
        _ => eventType.Replace('_', ' ')
    };
}
