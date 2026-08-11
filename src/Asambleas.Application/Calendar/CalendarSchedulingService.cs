namespace Asambleas.Application.Calendar;

using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Calendar;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Services;
using Microsoft.EntityFrameworkCore;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

public sealed class CalendarSchedulingService
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private static readonly int[] DefaultReminderOffsetsHours = [72, 24, 2];

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;

    public CalendarSchedulingService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
    }

    public async Task<CalendarListResponse> ListEventsAsync(
        DateTimeOffset fromUtc,
        DateTimeOffset toUtc,
        Guid? propertyHorizontalId,
        string? status,
        string? modality,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var canManage = RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage);

        var windowed = await ScopedAssembliesQuery(userId, canManage)
            .Where(a => a.ScheduledAtUtc >= fromUtc.AddDays(-1) && a.ScheduledAtUtc <= toUtc.AddDays(1))
            .ToListAsync(cancellationToken);

        windowed = windowed
            .Where(a => a.ScheduledAtUtc < toUtc && a.ResolveEstimatedEndAtUtc() > fromUtc)
            .ToList();

        if (propertyHorizontalId is Guid ph)
        {
            windowed = windowed.Where(a => a.PropertyHorizontalId == ph).ToList();
        }

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<AssemblyStatus>(status, true, out var st))
        {
            windowed = windowed.Where(a => a.Status == st).ToList();
        }

        if (!string.IsNullOrWhiteSpace(modality))
        {
            windowed = windowed
                .Where(a => a.Modality.Equals(modality, StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        var events = await MapEventsAsync(windowed, cancellationToken);
        return new CalendarListResponse(events.OrderBy(e => e.ScheduledAtUtc).ToList(), fromUtc, toUtc);
    }

    public async Task<NextAssemblyDto> GetNextAsync(CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var canManage = RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage);
        var now = DateTimeOffset.UtcNow;

        var upcoming = await ScopedAssembliesQuery(userId, canManage)
            .Where(a => a.Status != AssemblyStatus.Cancelled && a.Status != AssemblyStatus.Completed)
            .Where(a => a.ScheduledAtUtc >= now.AddHours(-6) || a.Status == AssemblyStatus.InProgress || a.Status == AssemblyStatus.Paused || a.Status == AssemblyStatus.CheckIn)
            .OrderBy(a => a.ScheduledAtUtc)
            .Take(20)
            .ToListAsync(cancellationToken);

        var live = upcoming.FirstOrDefault(a => a.Status is AssemblyStatus.InProgress or AssemblyStatus.Paused);
        var pick = live ?? upcoming.FirstOrDefault(a => a.ScheduledAtUtc >= now.AddHours(-1)) ?? upcoming.FirstOrDefault();
        var roleView = canManage ? "President" : "Owner";
        if (pick is null)
        {
            return new NextAssemblyDto(null, roleView);
        }

        var mapped = await MapEventsAsync([pick], cancellationToken);
        return new NextAssemblyDto(mapped.FirstOrDefault(), roleView);
    }

    public async Task<CalendarEventDto> GetEventAsync(Guid assemblyId, CancellationToken cancellationToken = default)
    {
        var assembly = await RequireScopedAssemblyAsync(assemblyId, cancellationToken);
        var mapped = await MapEventsAsync([assembly], cancellationToken);
        return mapped[0];
    }

    public async Task<AssemblyDetailDto> CreateAndScheduleAsync(
        ScheduleAssemblyRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsurePermission(Permissions.AssemblySchedule);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        if (_currentTenant.TenantId == Guid.Empty)
        {
            throw new DomainException("Tenant context is required.");
        }

        var tenantId = _currentTenant.TenantId;

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            throw new DomainException("Assembly title is required.");
        }

        if (request.ScheduledAtUtc < DateTimeOffset.UtcNow.AddMinutes(-5))
        {
            throw new DomainException("Cannot schedule an assembly in the past.");
        }

        var ph = await _db.PropertyHorizontals
            .FirstOrDefaultAsync(p => p.Id == request.PropertyHorizontalId, cancellationToken)
            ?? throw new DomainException("Property horizontal was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, ph.TenantId);
        if (ph.Status == PhLifecycleStatus.Inactive)
        {
            throw new DomainException(
                "PH_INACTIVE",
                "No se pueden programar asambleas en un PH desactivado. Reactívalo primero.");
        }

        var end = request.EstimatedEndAtUtc ?? request.ScheduledAtUtc.AddHours(2);
        if (end <= request.ScheduledAtUtc)
        {
            throw new DomainException("Estimated end must be after start.");
        }

        var conflicts = await FindConflictsAsync(
            ph.Id,
            request.ScheduledAtUtc,
            end,
            excludeAssemblyId: null,
            cancellationToken);
        if (conflicts.Count > 0 && !RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage))
        {
            throw new DomainException(
                $"Scheduling conflict with '{conflicts[0].Title}'. Choose another time or override as manager.");
        }

        var assembly = new AssemblyEntity
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            PropertyHorizontalId = ph.Id,
            Title = request.Title.Trim(),
            Modality = string.IsNullOrWhiteSpace(request.Modality) ? AssemblyEntity.ModalityVirtual : request.Modality.Trim().ToUpperInvariant(),
            AssemblyKind = string.IsNullOrWhiteSpace(request.AssemblyKind) ? "ORDINARY" : request.AssemblyKind.Trim().ToUpperInvariant(),
            ScheduledAtUtc = request.ScheduledAtUtc.ToUniversalTime(),
            EstimatedEndAtUtc = end.ToUniversalTime(),
            RequiredQuorumPercent = request.RequiredQuorumPercent <= 0 ? 50m : request.RequiredQuorumPercent,
            LocationText = request.LocationText,
            Notes = request.Notes,
            JoinWindowMinutesBefore = request.JoinWindowMinutesBefore is > 0 and <= 24 * 60
                ? request.JoinWindowMinutesBefore.Value
                : 30,
            Status = request.PublishAsScheduled ? AssemblyStatus.Scheduled : AssemblyStatus.Draft,
            ScheduleVersion = 1,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        _db.Assemblies.Add(assembly);

        // Auto-register creator as participant (president/admin) so they see the event.
        _db.AssemblyParticipants.Add(new AssemblyParticipant
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssemblyId = assembly.Id,
            UserId = userId,
            DisplayName = _currentTenant.DisplayName ?? "Organizer",
            RoleCode = _currentTenant.Roles.FirstOrDefault() ?? Roles.AssemblyPresident,
            AttendanceStatus = AttendanceStatus.Registered,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        });

        await RebuildReminderOccurrencesAsync(assembly, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            request.PublishAsScheduled ? AuditEventType.AssemblyScheduled : AuditEventType.AssemblyCreated,
            assembly.Id,
            metadata: new { assembly.ScheduledAtUtc, assembly.Status },
            cancellationToken: cancellationToken);

        return await ToDetailAsync(assembly, cancellationToken);
    }

    public async Task<RescheduleImpactDto> PreviewRescheduleAsync(
        Guid assemblyId,
        DateTimeOffset proposedStart,
        DateTimeOffset? proposedEnd,
        CancellationToken cancellationToken = default)
    {
        var assembly = await RequireScopedAssemblyAsync(assemblyId, track: false, cancellationToken);
        EnsureCanReschedule(assembly);
        var end = proposedEnd ?? proposedStart.AddHours(2);
        return await BuildImpactAsync(assembly, proposedStart, end, cancellationToken);
    }

    public async Task<CalendarEventDto> RescheduleAsync(
        Guid assemblyId,
        RescheduleAssemblyRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsurePermission(Permissions.AssemblyReschedule);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 3)
        {
            throw new DomainException("Reschedule reason is required.");
        }

        if (request.NewScheduledAtUtc < DateTimeOffset.UtcNow.AddMinutes(-5))
        {
            throw new DomainException("Cannot reschedule an assembly into the past.");
        }

        var assembly = await RequireScopedAssemblyAsync(assemblyId, track: true, cancellationToken);
        EnsureCanReschedule(assembly);

        if (request.ExpectedRowVersion is uint expected && assembly.RowVersion != expected)
        {
            throw new DomainException("This assembly was modified by another user. Refresh and try again.");
        }

        var newEnd = request.NewEstimatedEndAtUtc ?? request.NewScheduledAtUtc.AddHours(2);
        if (newEnd <= request.NewScheduledAtUtc)
        {
            throw new DomainException("Estimated end must be after start.");
        }

        var impact = await BuildImpactAsync(assembly, request.NewScheduledAtUtc, newEnd, cancellationToken);
        if (impact.Conflicts.Count > 0 &&
            !RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage))
        {
            throw new DomainException("Conflicts detected. Manager override required.");
        }

        var originalStart = assembly.ScheduledAtUtc;
        var originalEnd = assembly.EstimatedEndAtUtc;
        assembly.ScheduledAtUtc = request.NewScheduledAtUtc.ToUniversalTime();
        assembly.EstimatedEndAtUtc = newEnd.ToUniversalTime();
        assembly.ScheduleVersion += 1;
        assembly.UpdatedAtUtc = DateTimeOffset.UtcNow;

        var change = new AssemblyScheduleChange
        {
            Id = Guid.NewGuid(),
            TenantId = assembly.TenantId,
            AssemblyId = assembly.Id,
            OriginalScheduledAtUtc = originalStart,
            OriginalEstimatedEndAtUtc = originalEnd,
            NewScheduledAtUtc = assembly.ScheduledAtUtc,
            NewEstimatedEndAtUtc = assembly.EstimatedEndAtUtc,
            Reason = request.Reason.Trim(),
            ChangedByUserId = userId,
            ChangedAtUtc = DateTimeOffset.UtcNow,
            NotificationStatus = request.NotifyParticipants ? "Offered" : "Skipped",
            ImpactJson = JsonSerializer.Serialize(impact, JsonOpts),
            ScheduleVersionAfter = assembly.ScheduleVersion,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
        _db.AssemblyScheduleChanges.Add(change);

        await CancelPendingRemindersAsync(assembly.Id, "Rescheduled", cancellationToken);
        await RebuildReminderOccurrencesAsync(assembly, cancellationToken);

        // Versioned convocation update: never mutate sent V1; create Draft Vn+1.
        if (impact.HasSentConvocation)
        {
            var latest = await _db.Convocations
                .Where(c => c.AssemblyId == assembly.Id)
                .OrderByDescending(c => c.Version)
                .FirstOrDefaultAsync(cancellationToken);
            if (latest is not null)
            {
                _db.Convocations.Add(new Convocation
                {
                    Id = Guid.NewGuid(),
                    TenantId = assembly.TenantId,
                    PropertyHorizontalId = assembly.PropertyHorizontalId,
                    AssemblyId = assembly.Id,
                    Title = $"{latest.Title} — actualización de fecha (V{latest.Version + 1})",
                    Status = ConvocationStatus.Draft,
                    Version = latest.Version + 1,
                    ChannelsJson = latest.ChannelsJson,
                    TemplateId = latest.TemplateId,
                    Subject = latest.Subject,
                    BodyHtml = latest.BodyHtml,
                    BodyText = latest.BodyText +
                               $"\n\nACTUALIZACIÓN: nueva fecha {assembly.ScheduledAtUtc:u} UTC.",
                    CreatedByUserId = userId,
                    CreatedAtUtc = DateTimeOffset.UtcNow,
                    UpdatedAtUtc = DateTimeOffset.UtcNow
                });
            }
        }

        await NotifyPortalAsync(
            assembly,
            "Asamblea reprogramada",
            $"La asamblea «{assembly.Title}» fue reprogramada. Nueva fecha: {assembly.ScheduledAtUtc:u} UTC. Motivo: {request.Reason.Trim()}",
            cancellationToken);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new DomainException("This assembly was modified by another user. Refresh and try again.");
        }

        await _audit.WriteAsync(
            AuditEventType.AssemblyRescheduled,
            assembly.Id,
            metadata: new
            {
                original = originalStart,
                @new = assembly.ScheduledAtUtc,
                request.Reason,
                version = assembly.ScheduleVersion,
                notify = request.NotifyParticipants
            },
            cancellationToken: cancellationToken);

        var summary = Mapping.ToSummary(assembly);
        await _realtime.PublishAssemblyStatusAsync(assembly.Id, summary, cancellationToken);
        await _realtime.PublishAssemblyScheduleChangedAsync(assembly.Id, summary, cancellationToken);

        var mapped = await MapEventsAsync([assembly], cancellationToken);
        return mapped[0];
    }

    public async Task<CalendarEventDto> CancelAsync(
        Guid assemblyId,
        CancelAssemblyRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsurePermission(Permissions.AssemblyCancel);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 3)
        {
            throw new DomainException("Cancellation reason is required.");
        }

        var assembly = await RequireScopedAssemblyAsync(assemblyId, track: true, cancellationToken);
        if (request.ExpectedRowVersion is uint expected && assembly.RowVersion != expected)
        {
            throw new DomainException("This assembly was modified by another user. Refresh and try again.");
        }

        AssemblyLifecycle.EnsureCanTransition(assembly.Status, AssemblyStatus.Cancelled);
        assembly.Status = AssemblyStatus.Cancelled;
        assembly.CancelReason = request.Reason.Trim();
        assembly.CancelledAtUtc = DateTimeOffset.UtcNow;
        assembly.CancelledByUserId = userId;
        assembly.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await CancelPendingRemindersAsync(assembly.Id, "Assembly cancelled", cancellationToken);
        await NotifyPortalAsync(
            assembly,
            "Asamblea cancelada",
            $"La asamblea «{assembly.Title}» fue cancelada. Motivo: {request.Reason.Trim()}",
            cancellationToken);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new DomainException("This assembly was modified by another user. Refresh and try again.");
        }

        await _audit.WriteAsync(
            AuditEventType.AssemblyCancelled,
            assembly.Id,
            metadata: new { request.Reason, notify = request.NotifyParticipants },
            cancellationToken: cancellationToken);

        var summary = Mapping.ToSummary(assembly);
        await _realtime.PublishAssemblyStatusAsync(assembly.Id, summary, cancellationToken);
        await _realtime.PublishAssemblyScheduleChangedAsync(assembly.Id, summary, cancellationToken);

        var mapped = await MapEventsAsync([assembly], cancellationToken);
        return mapped[0];
    }

    public async Task<IReadOnlyList<ScheduleChangeDto>> GetHistoryAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        await RequireScopedAssemblyAsync(assemblyId, track: false, cancellationToken);
        return await _db.AssemblyScheduleChanges
            .AsNoTracking()
            .Where(c => c.AssemblyId == assemblyId)
            .OrderByDescending(c => c.ChangedAtUtc)
            .Select(c => new ScheduleChangeDto(
                c.Id,
                c.AssemblyId,
                c.OriginalScheduledAtUtc,
                c.NewScheduledAtUtc,
                c.Reason,
                c.ChangedByUserId,
                c.ChangedAtUtc,
                c.NotificationStatus,
                c.ScheduleVersionAfter,
                c.ImpactJson))
            .ToListAsync(cancellationToken);
    }

    public async Task<(string FileName, string Content)> BuildIcsAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var assembly = await RequireScopedAssemblyAsync(assemblyId, track: false, cancellationToken);
        var ph = await _db.PropertyHorizontals.AsNoTracking()
            .FirstAsync(p => p.Id == assembly.PropertyHorizontalId, cancellationToken);

        var end = assembly.ResolveEstimatedEndAtUtc();
        var uid = $"{assembly.Id:N}@asambleas";
        var stamp = DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var dtStart = assembly.ScheduledAtUtc.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var dtEnd = end.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var joinPath = $"/lobby.html?assemblyId={assembly.Id:D}";
        var description = EscapeIcs(
            $"{assembly.Title}\\nPH: {ph.Name}\\nModalidad: {assembly.Modality}\\nEntrada segura: use el portal ASAMBLEAS {joinPath}\\n(No incluye contraseñas ni tokens.)");
        var location = EscapeIcs(assembly.LocationText ?? (assembly.Modality.Contains("VIRTUAL", StringComparison.OrdinalIgnoreCase) ? "Virtual — ASAMBLEAS" : ph.Name));

        var sb = new StringBuilder();
        sb.AppendLine("BEGIN:VCALENDAR");
        sb.AppendLine("VERSION:2.0");
        sb.AppendLine("PRODID:-//ASAMBLEAS//Calendar//ES");
        sb.AppendLine("CALSCALE:GREGORIAN");
        sb.AppendLine("METHOD:PUBLISH");
        sb.AppendLine("BEGIN:VEVENT");
        sb.AppendLine($"UID:{uid}");
        sb.AppendLine($"DTSTAMP:{stamp}");
        sb.AppendLine($"DTSTART:{dtStart}");
        sb.AppendLine($"DTEND:{dtEnd}");
        sb.AppendLine($"SUMMARY:{EscapeIcs(assembly.Title)}");
        sb.AppendLine($"DESCRIPTION:{description}");
        sb.AppendLine($"LOCATION:{location}");
        sb.AppendLine("END:VEVENT");
        sb.AppendLine("END:VCALENDAR");

        return ($"asamblea-{assembly.Id:N}.ics", sb.ToString());
    }

    public async Task<AssemblyIcsLinksDto> GetCalendarLinksAsync(
        Guid assemblyId,
        string publicOrigin,
        CancellationToken cancellationToken = default)
    {
        var assembly = await RequireScopedAssemblyAsync(assemblyId, track: false, cancellationToken);
        var end = assembly.ResolveEstimatedEndAtUtc();
        var title = Uri.EscapeDataString(assembly.Title);
        var details = Uri.EscapeDataString($"Entrar vía portal ASAMBLEAS (sin tokens): {publicOrigin}/lobby.html?assemblyId={assembly.Id:D}");
        var location = Uri.EscapeDataString(assembly.LocationText ?? "Virtual");
        var gStart = assembly.ScheduledAtUtc.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var gEnd = end.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);
        var google = $"https://calendar.google.com/calendar/render?action=TEMPLATE&text={title}&dates={gStart}/{gEnd}&details={details}&location={location}";
        var outlook = $"https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject={title}&startdt={WebUtility.UrlEncode(assembly.ScheduledAtUtc.UtcDateTime.ToString("o"))}&enddt={WebUtility.UrlEncode(end.UtcDateTime.ToString("o"))}&body={details}&location={location}";

        return new AssemblyIcsLinksDto(
            assembly.Id,
            $"/api/assemblies/{assembly.Id:D}/calendar.ics",
            google,
            outlook);
    }

    private IQueryable<AssemblyEntity> ScopedAssembliesQuery(Guid userId, bool canManageAllInTenant)
    {
        // Owners: participation scope. Managers: all assemblies in tenant (filter applies).
        if (canManageAllInTenant &&
            RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage))
        {
            return _db.Assemblies.AsNoTracking();
        }

        var ids = _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Select(p => p.AssemblyId);
        return _db.Assemblies.AsNoTracking().Where(a => ids.Contains(a.Id));
    }

    private async Task<AssemblyEntity> RequireScopedAssemblyAsync(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        await RequireScopedAssemblyAsync(assemblyId, track: false, cancellationToken);

    private async Task<AssemblyEntity> RequireScopedAssemblyAsync(
        Guid assemblyId,
        bool track,
        CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var canManage = RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage);

        var query = track ? _db.Assemblies.AsQueryable() : _db.Assemblies.AsNoTracking();
        var assembly = await query.FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (!canManage)
        {
            var participant = await _db.AssemblyParticipants.AsNoTracking()
                .AnyAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken);
            if (!participant)
            {
                throw new DomainException($"Assembly '{assemblyId}' was not found.");
            }
        }

        return assembly;
    }

    private static void EnsureCanReschedule(AssemblyEntity assembly)
    {
        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled or AssemblyStatus.InProgress or AssemblyStatus.Paused)
        {
            throw new DomainException($"Cannot reschedule an assembly in status '{assembly.Status}'.");
        }
    }

    private void EnsurePermission(string permission)
    {
        var has = _currentTenant.Permissions.Contains(permission, StringComparer.Ordinal)
            || RolePermissionMap.HasPermission(_currentTenant.Roles, permission)
            || RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage)
            || _currentTenant.Permissions.Contains(Permissions.AssemblyManage, StringComparer.Ordinal);
        if (!has)
        {
            throw new DomainException($"Missing permission '{permission}'.");
        }
    }

    private async Task<RescheduleImpactDto> BuildImpactAsync(
        AssemblyEntity assembly,
        DateTimeOffset proposedStart,
        DateTimeOffset proposedEnd,
        CancellationToken cancellationToken)
    {
        var participants = await _db.AssemblyParticipants.CountAsync(p => p.AssemblyId == assembly.Id, cancellationToken);
        var convocations = await _db.Convocations
            .Where(c => c.AssemblyId == assembly.Id)
            .ToListAsync(cancellationToken);
        var pendingReminders = await _db.AssemblyReminderOccurrences
            .CountAsync(r => r.AssemblyId == assembly.Id && r.Status == "Pending", cancellationToken);
        var latestVersion = convocations.Count == 0 ? 0 : convocations.Max(c => c.Version);
        var hasSent = convocations.Any(c => c.Status == ConvocationStatus.Sent || c.SentAtUtc != null);
        var conflicts = await FindConflictsAsync(
            assembly.PropertyHorizontalId,
            proposedStart,
            proposedEnd,
            assembly.Id,
            cancellationToken);

        var notes = new List<string>();
        if (hasSent)
        {
            notes.Add("Se creará Convocation Draft V" + (latestVersion + 1) + " sin alterar el documento histórico enviado.");
        }

        notes.Add("Los recordatorios pendientes de la fecha anterior serán cancelados y recalculados.");
        notes.Add("La sala virtual LiveKit permanece aislada por assemblyId; no se recrea el secreto.");

        return new RescheduleImpactDto(
            assembly.Id,
            assembly.ScheduledAtUtc,
            proposedStart.ToUniversalTime(),
            participants,
            convocations.Count,
            pendingReminders,
            VirtualRooms: 1,
            hasSent,
            latestVersion,
            conflicts,
            notes);
    }

    private async Task<IReadOnlyList<CalendarConflictDto>> FindConflictsAsync(
        Guid propertyHorizontalId,
        DateTimeOffset start,
        DateTimeOffset end,
        Guid? excludeAssemblyId,
        CancellationToken cancellationToken)
    {
        var candidates = await _db.Assemblies.AsNoTracking()
            .Where(a => a.PropertyHorizontalId == propertyHorizontalId)
            .Where(a => a.Status != AssemblyStatus.Cancelled && a.Status != AssemblyStatus.Completed)
            .Where(a => excludeAssemblyId == null || a.Id != excludeAssemblyId)
            .ToListAsync(cancellationToken);

        var phName = await _db.PropertyHorizontals.AsNoTracking()
            .Where(p => p.Id == propertyHorizontalId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? "";

        return candidates
            .Where(a =>
            {
                var aEnd = a.ResolveEstimatedEndAtUtc();
                return a.ScheduledAtUtc < end && aEnd > start;
            })
            .Select(a => new CalendarConflictDto(a.Id, a.Title, a.ScheduledAtUtc, a.ResolveEstimatedEndAtUtc(), phName))
            .ToList();
    }

    private async Task CancelPendingRemindersAsync(Guid assemblyId, string reason, CancellationToken cancellationToken)
    {
        var pending = await _db.AssemblyReminderOccurrences
            .Where(r => r.AssemblyId == assemblyId && r.Status == "Pending")
            .ToListAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        foreach (var row in pending)
        {
            row.Status = "Cancelled";
            row.CancelledAtUtc = now;
            row.CancelReason = reason;
            row.UpdatedAtUtc = now;
        }
    }

    private async Task RebuildReminderOccurrencesAsync(AssemblyEntity assembly, CancellationToken cancellationToken)
    {
        var rules = await _db.ReminderRules.AsNoTracking()
            .Where(r => r.PropertyHorizontalId == assembly.PropertyHorizontalId && r.IsEnabled)
            .ToListAsync(cancellationToken);

        var offsets = rules.Count > 0
            ? rules.Select(r => r.OffsetHoursBeforeAssembly).Distinct().ToList()
            : DefaultReminderOffsetsHours.ToList();

        foreach (var offset in offsets)
        {
            var hours = Math.Abs(offset);
            var fire = assembly.ScheduledAtUtc.AddHours(-hours);
            if (fire < DateTimeOffset.UtcNow)
            {
                continue;
            }

            var rule = rules.FirstOrDefault(r => Math.Abs(r.OffsetHoursBeforeAssembly) == hours);
            _db.AssemblyReminderOccurrences.Add(new AssemblyReminderOccurrence
            {
                Id = Guid.NewGuid(),
                TenantId = assembly.TenantId,
                AssemblyId = assembly.Id,
                ReminderRuleId = rule?.Id,
                OffsetHoursBeforeAssembly = hours,
                FireAtUtc = fire,
                ScheduleVersion = assembly.ScheduleVersion,
                Status = "Pending",
                ChannelsJson = rule?.ChannelsJson ?? "[\"Portal\"]",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        }
    }

    private async Task NotifyPortalAsync(
        AssemblyEntity assembly,
        string title,
        string body,
        CancellationToken cancellationToken)
    {
        var userIds = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assembly.Id)
            .Select(p => p.UserId)
            .Distinct()
            .ToListAsync(cancellationToken);

        foreach (var uid in userIds)
        {
            _db.PortalNotifications.Add(new PortalNotification
            {
                Id = Guid.NewGuid(),
                TenantId = assembly.TenantId,
                PropertyHorizontalId = assembly.PropertyHorizontalId,
                UserId = uid,
                Title = title,
                Body = body,
                IsRead = false,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        }
    }

    private async Task<IReadOnlyList<CalendarEventDto>> MapEventsAsync(
        IReadOnlyList<AssemblyEntity> assemblies,
        CancellationToken cancellationToken)
    {
        if (assemblies.Count == 0)
        {
            return [];
        }

        var ids = assemblies.Select(a => a.Id).ToList();
        var phIds = assemblies.Select(a => a.PropertyHorizontalId).Distinct().ToList();
        var phMap = await _db.PropertyHorizontals.AsNoTracking()
            .Where(p => phIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, cancellationToken);
        var participantCounts = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => ids.Contains(p.AssemblyId))
            .GroupBy(p => p.AssemblyId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        var confirmedCounts = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => ids.Contains(p.AssemblyId) && p.IsAccredited)
            .GroupBy(p => p.AssemblyId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);
        var convocations = await _db.Convocations.AsNoTracking()
            .Where(c => ids.Contains(c.AssemblyId))
            .ToListAsync(cancellationToken);
        var rescheduledIds = await _db.AssemblyScheduleChanges.AsNoTracking()
            .Where(c => ids.Contains(c.AssemblyId))
            .Select(c => c.AssemblyId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var canReschedule = RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyReschedule)
            || RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage);
        var canCancel = RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyCancel)
            || RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage);
        var canManage = RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AssemblyManage);
        var now = DateTimeOffset.UtcNow;

        var list = new List<CalendarEventDto>();
        foreach (var a in assemblies)
        {
            phMap.TryGetValue(a.PropertyHorizontalId, out var ph);
            var tz = ph?.TimeZoneId ?? "America/Panama";
            var end = a.ResolveEstimatedEndAtUtc();
            var joinOpens = a.ScheduledAtUtc.AddMinutes(-Math.Max(0, a.JoinWindowMinutesBefore));
            var canJoin = a.Status is AssemblyStatus.InProgress or AssemblyStatus.Paused or AssemblyStatus.CheckIn
                || (a.Status == AssemblyStatus.Scheduled && now >= joinOpens && now <= end.AddHours(1));
            var conv = convocations
                .Where(c => c.AssemblyId == a.Id)
                .OrderByDescending(c => c.Version)
                .FirstOrDefault();
            var calendarStatus = ResolveCalendarStatus(a, conv, rescheduledIds.Contains(a.Id));
            list.Add(new CalendarEventDto(
                a.Id,
                a.PropertyHorizontalId,
                ph?.Name ?? "",
                tz,
                a.Title,
                a.AssemblyKind,
                a.Modality,
                a.Status.ToString(),
                calendarStatus,
                a.ScheduledAtUtc,
                end,
                ScheduledLocalHint: a.ScheduledAtUtc,
                a.LocationText,
                a.JoinWindowMinutesBefore,
                canJoin,
                joinOpens,
                WasRescheduled: rescheduledIds.Contains(a.Id),
                a.ScheduleVersion,
                conv?.Status.ToString(),
                participantCounts.GetValueOrDefault(a.Id),
                confirmedCounts.GetValueOrDefault(a.Id),
                FormatCountdown(a, now, joinOpens),
                canReschedule && a.Status is AssemblyStatus.Draft or AssemblyStatus.Scheduled or AssemblyStatus.CheckIn,
                canCancel && a.Status is AssemblyStatus.Draft or AssemblyStatus.Scheduled or AssemblyStatus.CheckIn,
                canManage));
        }

        return list;
    }

    private static string ResolveCalendarStatus(AssemblyEntity a, Convocation? conv, bool wasRescheduled)
    {
        if (a.Status == AssemblyStatus.Cancelled) return "CANCELLED";
        if (a.Status == AssemblyStatus.Completed) return "COMPLETED";
        if (a.Status is AssemblyStatus.InProgress or AssemblyStatus.Paused) return "LIVE";
        if (a.Status == AssemblyStatus.CheckIn) return "READY";
        if (a.Status == AssemblyStatus.Draft) return "DRAFT";
        if (wasRescheduled && a.Status == AssemblyStatus.Scheduled) return "RESCHEDULED";
        if (conv is null) return "CONVOCATION_PENDING";
        if (conv.Status == ConvocationStatus.Sent || conv.SentAtUtc != null) return "CONVOKED";
        if (conv.Status == ConvocationStatus.Draft || conv.Status == ConvocationStatus.Ready) return "CONVOCATION_PENDING";
        return "SCHEDULED";
    }

    private static string FormatCountdown(AssemblyEntity a, DateTimeOffset now, DateTimeOffset joinOpens)
    {
        if (a.Status is AssemblyStatus.InProgress or AssemblyStatus.Paused) return "EN VIVO";
        if (a.Status == AssemblyStatus.Completed) return "Finalizada";
        if (a.Status == AssemblyStatus.Cancelled) return "Cancelada";
        if (now < joinOpens)
        {
            var delta = joinOpens - now;
            return $"Lobby abre en {FormatDuration(delta)}";
        }

        if (now < a.ScheduledAtUtc)
        {
            return $"Faltan {FormatDuration(a.ScheduledAtUtc - now)}";
        }

        if (a.Status == AssemblyStatus.CheckIn || a.Status == AssemblyStatus.Scheduled)
        {
            return "Disponible para entrar";
        }

        return "";
    }

    private static string FormatDuration(TimeSpan t)
    {
        if (t.TotalDays >= 1) return $"{(int)t.TotalDays}d {t.Hours}h";
        if (t.TotalHours >= 1) return $"{(int)t.TotalHours}h {t.Minutes}m";
        return $"{Math.Max(1, (int)t.TotalMinutes)}m";
    }

    private static string EscapeIcs(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace(";", "\\;", StringComparison.Ordinal)
            .Replace(",", "\\,", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);

    private async Task<AssemblyDetailDto> ToDetailAsync(AssemblyEntity assembly, CancellationToken cancellationToken)
    {
        var phName = await _db.PropertyHorizontals.AsNoTracking()
            .Where(p => p.Id == assembly.PropertyHorizontalId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? "";
        return new AssemblyDetailDto(
            assembly.Id,
            assembly.TenantId,
            assembly.PropertyHorizontalId,
            phName,
            assembly.Title,
            assembly.Modality,
            assembly.Status.ToString(),
            assembly.ScheduledAtUtc,
            assembly.RequiredQuorumPercent,
            assembly.ActiveAgendaItemId,
            assembly.CreatedAtUtc,
            assembly.UpdatedAtUtc);
    }
}
