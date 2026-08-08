namespace Asambleas.Application.Assembly;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Agenda;
using Asambleas.Application.Attendance;
using Asambleas.Application.Common;
using Asambleas.Application.Meeting;
using Asambleas.Application.Motion;
using Asambleas.Application.Quorum;
using Asambleas.Application.Speaker;
using Asambleas.Application.Voting;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Audit;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Quorum;
using Asambleas.Contracts.Voting;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

public sealed class AssemblyRoomService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IMeetingProvider _meetingProvider;
    private readonly AssemblyService _assemblies;
    private readonly AttendanceService _attendance;
    private readonly QuorumService _quorum;
    private readonly AgendaService _agenda;
    private readonly MotionService _motions;
    private readonly VotingService _voting;
    private readonly SpeakerService _speakers;
    private readonly MeetingService _meetings;
    private readonly Audit.AuditService _audit;

    public AssemblyRoomService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IMeetingProvider meetingProvider,
        AssemblyService assemblies,
        AttendanceService attendance,
        QuorumService quorum,
        AgendaService agenda,
        MotionService motions,
        VotingService voting,
        SpeakerService speakers,
        MeetingService meetings,
        Audit.AuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _meetingProvider = meetingProvider;
        _assemblies = assemblies;
        _attendance = attendance;
        _quorum = quorum;
        _agenda = agenda;
        _motions = motions;
        _voting = voting;
        _speakers = speakers;
        _meetings = meetings;
        _audit = audit;
    }

    public async Task<AssemblyRoomStateDto> GetRoomStateAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var detail = await _assemblies.GetAsync(assemblyId, cancellationToken);
        var readiness = await GetReadinessAsync(assemblyId, cancellationToken);
        var quorum = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
        var agenda = await _agenda.GetItemsAsync(assemblyId, cancellationToken);
        var activeMotion = await _motions.GetActiveAsync(assemblyId, cancellationToken);
        var openSession = await _voting.GetOpenSessionAsync(assemblyId, cancellationToken);

        VotingResultsDto? openResults = null;
        var hasVoted = false;
        Guid? evidenceId = null;

        if (openSession is not null)
        {
            var receipt = await _voting.GetMyVoteReceiptAsync(assemblyId, openSession.Id, cancellationToken);
            hasVoted = receipt is not null;
            evidenceId = receipt?.EvidenceId;

            if (!openSession.HidePartialResults)
            {
                openResults = await _voting.TryGetOpenSessionResultsAsync(assemblyId, openSession.Id, cancellationToken);
            }
        }

        var participants = await _attendance.ListParticipantsAsync(assemblyId, cancellationToken);
        var speakerQueue = await _speakers.GetQueueAsync(assemblyId, cancellationToken);
        var meeting = await _meetings.GetRoomInfoAsync(assemblyId, cancellationToken);

        var roleCode = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId && p.UserId == userId)
            .Select(p => p.RoleCode)
            .FirstOrDefaultAsync(cancellationToken);

        DateTimeOffset? assemblyStartedAtUtc = null;
        if (detail.Status is nameof(AssemblyStatus.InProgress) or nameof(AssemblyStatus.Paused)
            or nameof(AssemblyStatus.Completed))
        {
            assemblyStartedAtUtc = await _db.AuditEvents
                .AsNoTracking()
                .Where(e => e.AssemblyId == assemblyId && e.EventType == AuditEventType.AssemblyStarted)
                .OrderBy(e => e.OccurredAtUtc)
                .Select(e => (DateTimeOffset?)e.OccurredAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return new AssemblyRoomStateDto(
            detail,
            readiness,
            quorum,
            agenda.Items,
            activeMotion,
            openSession,
            openResults,
            hasVoted,
            evidenceId,
            participants,
            speakerQueue.Queue,
            meeting,
            AssemblyRoomRules.ResolveViewerRole(roleCode),
            assemblyStartedAtUtc);
    }

    public async Task<AssemblyReadinessDto> GetReadinessAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);

        var participantCount = await _db.AssemblyParticipants
            .AsNoTracking()
            .CountAsync(p => p.AssemblyId == assemblyId, cancellationToken);

        var units = await _db.Units
            .AsNoTracking()
            .Where(u => u.PropertyHorizontalId == assembly.PropertyHorizontalId)
            .Select(u => u.CoefficientPercent)
            .ToListAsync(cancellationToken);

        var agendaCount = await _db.AgendaItems
            .AsNoTracking()
            .CountAsync(i => i.AssemblyId == assemblyId, cancellationToken);

        var meetingConfigured = await _meetingProvider.IsConfiguredAsync(cancellationToken);
        var modalityAllowsWithoutAv = !string.Equals(
            assembly.Modality,
            AssemblyEntity.ModalityVirtual,
            StringComparison.OrdinalIgnoreCase);

        var participantsReady = participantCount > 0;
        var coefficientsReady = units.Count > 0 && units.All(c => c > 0m);
        var agendaReady = agendaCount > 0;
        // LiveKit is optional for EO-002 demo: governance can proceed without AV.
        // meetingReady reflects real AV readiness; missing LiveKit does not block ReadyToStart.
        var meetingReady = meetingConfigured || modalityAllowsWithoutAv;
        var votingRulesReady = assembly.RequiredQuorumPercent > 0m;

        var blockers = new List<string>();
        if (!participantsReady)
        {
            blockers.Add("Participants: no registered participants.");
        }

        if (!coefficientsReady)
        {
            blockers.Add(units.Count == 0
                ? "Coefficients: no units configured for the property."
                : "Coefficients: one or more units have a non-positive coefficient.");
        }

        if (!agendaReady)
        {
            blockers.Add("Agenda: at least one agenda item is required.");
        }

        if (!meetingReady)
        {
            blockers.Add("Meeting: LiveKit is not configured — audio/video BLOCKED; assembly may continue without AV.");
        }

        if (!votingRulesReady)
        {
            blockers.Add("Voting rules: required quorum percent must be greater than zero.");
        }

        var ready = participantsReady && coefficientsReady && agendaReady && votingRulesReady;

        return new AssemblyReadinessDto(
            participantsReady,
            coefficientsReady,
            agendaReady,
            meetingReady,
            votingRulesReady,
            ready,
            blockers);
    }

    public async Task<AssemblyDashboardDto> GetDashboardAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var detail = await _assemblies.GetAsync(assemblyId, cancellationToken);
        var readiness = await GetReadinessAsync(assemblyId, cancellationToken);

        var participants = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId)
            .Select(p => p.AttendanceStatus)
            .ToListAsync(cancellationToken);

        var unitCount = await _db.Units
            .AsNoTracking()
            .CountAsync(u => u.PropertyHorizontalId == detail.PropertyHorizontalId, cancellationToken);

        var agendaCount = await _db.AgendaItems
            .AsNoTracking()
            .CountAsync(i => i.AssemblyId == assemblyId, cancellationToken);

        var motionCount = await _db.Motions
            .AsNoTracking()
            .CountAsync(m => m.AssemblyId == assemblyId, cancellationToken);

        var checkedIn = participants.Count(s =>
            s is AttendanceStatus.CheckedIn
                or AttendanceStatus.Present
                or AttendanceStatus.TemporarilyDisconnected);

        var counts = new AssemblyDashboardCountsDto(
            participants.Count,
            checkedIn,
            unitCount,
            agendaCount,
            motionCount);

        return new AssemblyDashboardDto(
            detail.Id,
            detail.Title,
            detail.PropertyHorizontalId,
            detail.PropertyHorizontalName,
            detail.ScheduledAtUtc,
            detail.Status,
            detail.Modality,
            readiness,
            counts,
            AssemblyRoomRules.ResolvePrimaryCta(detail.Status));
    }

    public async Task<AssemblyMinutesDto> GetMinutesAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var detail = await _assemblies.GetAsync(assemblyId, cancellationToken);
        var participants = await _attendance.ListParticipantsAsync(assemblyId, cancellationToken);
        var checkedIn = participants
            .Where(p => p.AttendanceStatus is nameof(AttendanceStatus.CheckedIn)
                or nameof(AttendanceStatus.Present)
                or nameof(AttendanceStatus.TemporarilyDisconnected))
            .ToList();

        var quorum = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
        var agenda = await _agenda.GetItemsAsync(assemblyId, cancellationToken);
        var motions = await _motions.ListAsync(assemblyId, cancellationToken);
        var motionEntries = await BuildMotionEntriesAsync(assemblyId, motions, closedOnly: true, cancellationToken);

        var auditPage = await _audit.QueryAsync(
            new AuditEventQuery(assemblyId, null, null, null, 0, 200),
            cancellationToken);

        DateTimeOffset? checkInAt = FirstAudit(auditPage.Items, AuditEventType.AssemblyJoin);
        DateTimeOffset? startedAt = FirstAudit(auditPage.Items, AuditEventType.AssemblyStarted);
        DateTimeOffset? completedAt = FirstAudit(auditPage.Items, AuditEventType.AssemblyCompleted);

        return new AssemblyMinutesDto(
            detail.Id,
            detail.Title,
            detail.PropertyHorizontalName,
            detail.ScheduledAtUtc,
            detail.Status,
            detail.Modality,
            DateTimeOffset.UtcNow,
            checkedIn,
            quorum,
            agenda.Items,
            motionEntries,
            checkInAt,
            startedAt,
            completedAt);
    }

    public async Task<AssemblyEvidenceDto> GetEvidenceAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var detail = await _assemblies.GetAsync(assemblyId, cancellationToken);
        var attendance = await _attendance.ListParticipantsAsync(assemblyId, cancellationToken);
        var snapshots = await _quorum.ListSnapshotsAsync(assemblyId, cancellationToken);
        var motions = await _motions.ListAsync(assemblyId, cancellationToken);
        var voting = await BuildMotionEntriesAsync(assemblyId, motions, closedOnly: false, cancellationToken);

        var auditPage = await _audit.QueryAsync(
            new AuditEventQuery(assemblyId, null, null, null, 0, 100),
            cancellationToken);

        return new AssemblyEvidenceDto(
            detail.Id,
            detail.Title,
            DateTimeOffset.UtcNow,
            attendance,
            snapshots,
            motions,
            voting,
            auditPage.Items);
    }

    private async Task<IReadOnlyList<AssemblyMinutesMotionEntryDto>> BuildMotionEntriesAsync(
        Guid assemblyId,
        IReadOnlyList<MotionDto> motions,
        bool closedOnly,
        CancellationToken cancellationToken)
    {
        var sessions = await _db.VotingSessions
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId)
            .OrderByDescending(s => s.OpenedAtUtc)
            .ToListAsync(cancellationToken);

        var result = new List<AssemblyMinutesMotionEntryDto>();
        foreach (var motion in motions)
        {
            var session = sessions.FirstOrDefault(s => s.MotionId == motion.Id);
            if (closedOnly && session is not null && session.Status != VotingSessionStatus.Closed)
            {
                session = null;
            }

            VotingSessionDto? sessionDto = null;
            VotingResultsDto? results = null;
            if (session is not null)
            {
                sessionDto = new VotingSessionDto(
                    session.Id,
                    session.AssemblyId,
                    session.MotionId,
                    session.Status.ToString(),
                    session.OpenedAtUtc,
                    session.ClosedAtUtc,
                    session.HidePartialResults);

                if (session.Status == VotingSessionStatus.Closed
                    || (session.Status == VotingSessionStatus.Open && !session.HidePartialResults))
                {
                    results = await _voting.TryGetOpenSessionResultsAsync(assemblyId, session.Id, cancellationToken);
                }
            }

            if (closedOnly && sessionDto is null && results is null)
            {
                result.Add(new AssemblyMinutesMotionEntryDto(motion, null, null));
                continue;
            }

            result.Add(new AssemblyMinutesMotionEntryDto(motion, sessionDto, results));
        }

        return result;
    }

    private async Task<AssemblyEntity> RequireAssemblyAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        return assembly;
    }

    private static DateTimeOffset? FirstAudit(IReadOnlyList<AuditEventDto> items, string eventType) =>
        items.Where(e => e.EventType == eventType)
            .OrderBy(e => e.OccurredAtUtc)
            .Select(e => (DateTimeOffset?)e.OccurredAtUtc)
            .FirstOrDefault();
}
