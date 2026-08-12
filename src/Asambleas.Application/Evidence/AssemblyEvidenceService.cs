namespace Asambleas.Application.Evidence;

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Agenda;
using Asambleas.Application.Assembly;
using Asambleas.Application.Attendance;
using Asambleas.Application.Common;
using Asambleas.Application.Motion;
using Asambleas.Application.Quorum;
using Asambleas.Application.Speaker;
using Asambleas.Application.Voting;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Audit;
using Asambleas.Contracts.Evidence;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Voting;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class AssemblyEvidenceService
{
    private static readonly JsonSerializerOptions HashJson = new(JsonSerializerDefaults.Web);

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly AssemblyService _assemblies;
    private readonly AttendanceService _attendance;
    private readonly QuorumService _quorum;
    private readonly AgendaService _agenda;
    private readonly MotionService _motions;
    private readonly VotingService _voting;
    private readonly SpeakerService _speakers;
    private readonly Audit.AuditService _audit;

    public AssemblyEvidenceService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        AssemblyService assemblies,
        AttendanceService attendance,
        QuorumService quorum,
        AgendaService agenda,
        MotionService motions,
        VotingService voting,
        SpeakerService speakers,
        Audit.AuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _assemblies = assemblies;
        _attendance = attendance;
        _quorum = quorum;
        _agenda = agenda;
        _motions = motions;
        _voting = voting;
        _speakers = speakers;
        _audit = audit;
    }

    public async Task<AssemblyEvidencePackageDto> GetEvidencePackageAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var detail = await _assemblies.GetAsync(assemblyId, cancellationToken);
        var attendance = await _attendance.ListParticipantsAsync(assemblyId, cancellationToken);
        var snapshots = await _quorum.ListSnapshotsAsync(assemblyId, cancellationToken);
        var latestQuorum = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
        var agenda = await _agenda.GetItemsAsync(assemblyId, cancellationToken);
        var motions = await _motions.ListAsync(assemblyId, cancellationToken);
        var voting = await BuildMotionEntriesAsync(assemblyId, motions, closedOnly: false, cancellationToken);
        var decisions = BuildDecisions(detail.Id, voting);
        var interventions = (await _speakers.GetQueueAsync(assemblyId, cancellationToken)).Queue;
        var representations = await LoadRepresentationsAsync(assemblyId, attendance, cancellationToken);

        var auditPage = await _audit.QueryAsync(
            new AuditEventQuery(assemblyId, null, null, null, 0, 500),
            cancellationToken);

        var completeness = EvaluateCompleteness(
            detail.Status,
            attendance,
            snapshots,
            agenda.Items.Count,
            decisions.Count);

        return new AssemblyEvidencePackageDto(
            detail.Id,
            detail.Title,
            detail.PropertyHorizontalName,
            detail.Status,
            detail.Modality,
            detail.ScheduledAtUtc,
            DateTimeOffset.UtcNow,
            completeness,
            attendance,
            representations,
            snapshots,
            latestQuorum,
            agenda.Items,
            interventions,
            motions,
            voting,
            decisions,
            auditPage.Items);
    }

    public async Task<AssemblyMinutesDocumentDto> GetMinutesDocumentAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var sealedRow = await _db.Assemblies
            .AsNoTracking()
            .Where(a => a.Id == assemblyId)
            .Select(a => new { a.SealedMinutesJson, a.SealedMinutesHash, a.Status })
            .FirstOrDefaultAsync(cancellationToken);

        if (sealedRow?.SealedMinutesJson is { Length: > 0 } json
            && sealedRow.Status is AssemblyStatus.Completed)
        {
            var sealedDoc = JsonSerializer.Deserialize<AssemblyMinutesDocumentDto>(json, HashJson);
            if (sealedDoc is not null)
            {
                return sealedDoc with { IsSealed = true, ContentHash = sealedRow.SealedMinutesHash ?? sealedDoc.ContentHash };
            }
        }

        return await BuildMinutesDocumentAsync(assemblyId, cancellationToken);
    }

    /// <summary>Persist immutable minutes after Complete. Idempotent if already sealed.</summary>
    public async Task<AssemblyMinutesDocumentDto> SealMinutesAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status != AssemblyStatus.Completed)
        {
            throw new DomainException("ASSEMBLY_NOT_COMPLETED", "Only completed assemblies can seal minutes.");
        }

        if (!string.IsNullOrWhiteSpace(assembly.SealedMinutesJson)
            && !string.IsNullOrWhiteSpace(assembly.SealedMinutesHash))
        {
            var existing = JsonSerializer.Deserialize<AssemblyMinutesDocumentDto>(assembly.SealedMinutesJson, HashJson);
            if (existing is not null)
            {
                return existing with { IsSealed = true };
            }
        }

        var doc = await BuildMinutesDocumentAsync(assemblyId, cancellationToken);
        var sealedDoc = doc with { IsSealed = true };
        assembly.SealedMinutesJson = JsonSerializer.Serialize(sealedDoc, HashJson);
        assembly.SealedMinutesHash = sealedDoc.ContentHash;
        assembly.SealedMinutesDocumentId = sealedDoc.DocumentId;
        assembly.SealedAtUtc = DateTimeOffset.UtcNow;
        assembly.UpdatedAtUtc = assembly.SealedAtUtc.Value;
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.AssemblyCompleted,
            assemblyId,
            metadata: new
            {
                Sealed = true,
                sealedDoc.DocumentId,
                sealedDoc.ContentHash
            },
            cancellationToken: cancellationToken);

        return sealedDoc;
    }

    private async Task<AssemblyMinutesDocumentDto> BuildMinutesDocumentAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        var package = await GetEvidencePackageAsync(assemblyId, cancellationToken);
        var closedVoting = package.Voting
            .Where(v => v.ClosedSession?.Status == nameof(VotingSessionStatus.Closed))
            .ToList();

        var audit = package.Timeline;
        DateTimeOffset? checkInAt = FirstAudit(audit, AuditEventType.AssemblyJoin);
        DateTimeOffset? startedAt = FirstAudit(audit, AuditEventType.AssemblyStarted);
        DateTimeOffset? completedAt = FirstAudit(audit, AuditEventType.AssemblyCompleted);

        var documentId = $"ACTA-{package.AssemblyId:N}-{package.GeneratedAtUtc:yyyyMMddHHmmss}";
        var hashPayload = JsonSerializer.Serialize(new
        {
            package.AssemblyId,
            package.Status,
            package.Attendance,
            package.Representations,
            package.QuorumSnapshots,
            package.Agenda,
            Motions = closedVoting,
            package.Decisions
        }, HashJson);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(hashPayload)));

        return new AssemblyMinutesDocumentDto(
            package.AssemblyId,
            package.Title,
            package.PropertyHorizontalName,
            package.Status,
            package.Modality,
            package.ScheduledAtUtc,
            package.GeneratedAtUtc,
            documentId,
            hash,
            package.Completeness,
            checkInAt,
            startedAt,
            completedAt,
            package.LatestQuorum,
            package.Attendance.Where(p =>
                p.IsAccredited
                || p.AttendanceStatus is nameof(AttendanceStatus.CheckedIn)
                    or nameof(AttendanceStatus.Present)
                    or nameof(AttendanceStatus.TemporarilyDisconnected)).ToList(),
            package.Representations.Where(r => r.IsActive).ToList(),
            package.Agenda,
            package.Interventions,
            closedVoting,
            package.Decisions,
            "Este documento resume hechos verificados por el sistema. No constituye por sí solo validación jurídica externa.",
            IsSealed: false);
    }

    /// <summary>Backward-compatible projection used by older clients.</summary>
    public async Task<AssemblyMinutesDto> GetLegacyMinutesAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var doc = await GetMinutesDocumentAsync(assemblyId, cancellationToken);
        return new AssemblyMinutesDto(
            doc.AssemblyId,
            doc.Title,
            doc.PropertyHorizontalName,
            doc.ScheduledAtUtc,
            doc.Status,
            doc.Modality,
            doc.GeneratedAtUtc,
            doc.Attendance,
            doc.Quorum,
            doc.Agenda,
            doc.Motions,
            doc.CheckInStartedAtUtc,
            doc.AssemblyStartedAtUtc,
            doc.CompletedAtUtc);
    }

    /// <summary>Backward-compatible projection.</summary>
    public async Task<AssemblyEvidenceDto> GetLegacyEvidenceAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var package = await GetEvidencePackageAsync(assemblyId, cancellationToken);
        return new AssemblyEvidenceDto(
            package.AssemblyId,
            package.Title,
            package.GeneratedAtUtc,
            package.Attendance,
            package.QuorumSnapshots,
            package.Motions,
            package.Voting,
            package.Timeline);
    }

    private async Task<IReadOnlyList<RepresentationEvidenceDto>> LoadRepresentationsAsync(
        Guid assemblyId,
        IReadOnlyList<AssemblyParticipantDto> attendance,
        CancellationToken cancellationToken)
    {
        var names = attendance.ToDictionary(p => p.UserId, p => p.DisplayName);
        var rows = await _db.AssemblyRepresentations
            .AsNoTracking()
            .Where(r => r.AssemblyId == assemblyId)
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return [];
        }

        var unitIds = rows.Select(r => r.UnitId).Distinct().ToList();
        var codes = await _db.Units
            .AsNoTracking()
            .Where(u => unitIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Code, cancellationToken);

        return rows
            .Select(r => new RepresentationEvidenceDto(
                r.UnitId,
                codes.GetValueOrDefault(r.UnitId, "?"),
                r.CoefficientSnapshot,
                r.RepresentativeUserId,
                names.GetValueOrDefault(r.RepresentativeUserId, "—"),
                r.Source.ToString(),
                r.PowerId,
                r.IsActive))
            .OrderBy(r => r.UnitCode)
            .ToList();
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
                    session.HidePartialResults,
                    session.AppliedDecisionRule,
                    session.DecisionStatus,
                    session.ResultVisibilityPolicy,
                    session.OpenedByUserId,
                    session.EligibleVoters,
                    session.EligibleCoefficient);

                if (session.Status == VotingSessionStatus.Closed
                    || session.Status == VotingSessionStatus.Open)
                {
                    results = await _voting.TryGetOpenSessionResultsAsync(assemblyId, session.Id, cancellationToken);
                    if (results is null && session.Status == VotingSessionStatus.Open)
                    {
                        var pulse = await _voting.GetResultsAsync(assemblyId, session.Id, cancellationToken);
                        results = new VotingResultsDto(
                            pulse.VotingSessionId,
                            pulse.MotionId,
                            pulse.InFavorCoefficient,
                            pulse.AgainstCoefficient,
                            pulse.AbstentionCoefficient,
                            pulse.VotesCast,
                            pulse.DecisionStatus,
                            pulse.InFavorVotes,
                            pulse.AgainstVotes,
                            pulse.AbstentionVotes,
                            pulse.AppliedDecisionRule,
                            pulse.DecisionExplanation,
                            pulse.EligibleVoters,
                            pulse.ParticipatingCoefficient,
                            pulse.EligibleCoefficient,
                            pulse.TrendHidden,
                            pulse.ResultVisibilityPolicy);
                    }
                }
            }

            if (closedOnly && sessionDto is null && results is null)
            {
                continue;
            }

            result.Add(new AssemblyMinutesMotionEntryDto(motion, sessionDto, results));
        }

        return result;
    }

    private static IReadOnlyList<DecisionDto> BuildDecisions(
        Guid assemblyId,
        IReadOnlyList<AssemblyMinutesMotionEntryDto> voting)
    {
        var closed = voting
            .Where(v => v.ClosedSession?.Status == nameof(VotingSessionStatus.Closed)
                        && v.Results is not null)
            .OrderBy(v => v.ClosedSession!.ClosedAtUtc)
            .ToList();

        var year = DateTime.UtcNow.Year;
        var list = new List<DecisionDto>();
        var ordinal = 1;
        foreach (var entry in closed)
        {
            var session = entry.ClosedSession!;
            var results = entry.Results!;
            var status = session.DecisionStatus ?? results.DecisionStatus ?? entry.Motion.Status;
            var rule = session.AppliedDecisionRule ?? results.AppliedDecisionRule ?? "SimpleMajority";
            var explanation =
                results.DecisionExplanation
                ?? $"Resultado según regla {rule}: a favor {results.InFavorCoefficient:0.####}% / en contra {results.AgainstCoefficient:0.####}% / abstención {results.AbstentionCoefficient:0.####}%.";

            list.Add(new DecisionDto(
                $"DEC-{year}-{ordinal:D4}",
                assemblyId,
                entry.Motion.Id,
                entry.Motion.Code,
                entry.Motion.Title,
                entry.Motion.AgendaItemId,
                status,
                rule,
                results.InFavorCoefficient,
                results.AgainstCoefficient,
                results.AbstentionCoefficient,
                results.VotesCast,
                session.ClosedAtUtc,
                session.Id,
                session.HidePartialResults,
                explanation));
            ordinal++;
        }

        return list;
    }

    private static EvidenceCompletenessDto EvaluateCompleteness(
        string status,
        IReadOnlyList<AssemblyParticipantDto> attendance,
        IReadOnlyList<Contracts.Quorum.QuorumSnapshotDto> snapshots,
        int agendaCount,
        int decisionCount)
    {
        var notes = new List<string>();
        var hasAttendance = attendance.Any(p => p.IsAccredited || p.AttendanceStatus is not nameof(AttendanceStatus.Registered));
        var hasQuorum = snapshots.Count > 0;
        var hasAgenda = agendaCount > 0;
        var isClosed = status == nameof(AssemblyStatus.Completed);

        if (!hasAttendance) notes.Add("Sin asistentes acreditados/registrados en check-in.");
        if (!hasQuorum) notes.Add("Sin snapshots de quórum.");
        if (!hasAgenda) notes.Add("Sin puntos de agenda.");
        if (isClosed && decisionCount == 0) notes.Add("Asamblea cerrada sin decisiones registradas (puede ser válido).");

        var statusLabel = notes.Count == 0
            ? (isClosed ? "COMPLETE" : "WARNING")
            : (hasAttendance && hasAgenda ? "WARNING" : "INCOMPLETE");

        if (!isClosed && notes.Count == 0)
        {
            notes.Add("Expediente en curso — la asamblea aún no está cerrada.");
            statusLabel = "WARNING";
        }

        return new EvidenceCompletenessDto(
            statusLabel,
            notes,
            hasAttendance,
            hasQuorum,
            hasAgenda,
            decisionCount > 0,
            isClosed);
    }

    private static DateTimeOffset? FirstAudit(IReadOnlyList<AuditEventDto> items, string eventType) =>
        items.Where(i => i.EventType == eventType).OrderBy(i => i.OccurredAtUtc).Select(i => (DateTimeOffset?)i.OccurredAtUtc).FirstOrDefault();
}
