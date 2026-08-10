namespace Asambleas.Application.Attendance;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Quorum;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Representation;
using Asambleas.Domain.Attendance;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class AttendanceService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly QuorumService _quorum;
    private readonly IAssemblyRepresentationService _representation;

    public AttendanceService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime,
        QuorumService quorum,
        IAssemblyRepresentationService representation)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
        _quorum = quorum;
        _representation = representation;
    }

    /// <summary>Self check-in / accreditation for the current user.</summary>
    public Task<AccreditResponse> CheckInAsync(
        Guid assemblyId,
        CheckInRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = TenantGuard.RequireUserId(_currentTenant);
        return AccreditInternalAsync(
            assemblyId,
            userId,
            request.PresenceType,
            method: "SelfCheckIn",
            clientUnitId: request.UnitId,
            cancellationToken);
    }

    /// <summary>Operator accreditation of another participant.</summary>
    public Task<AccreditResponse> AccreditAsync(
        Guid assemblyId,
        Guid targetUserId,
        AccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        return AccreditInternalAsync(
            assemblyId,
            targetUserId,
            request.PresenceType,
            method: request.Method ?? "OperatorCheckIn",
            clientUnitId: null,
            cancellationToken);
    }

    public Task<RepresentationPreviewDto> PreviewAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default) =>
        _representation.PreviewAsync(assemblyId, userId, cancellationToken);

    private async Task<AccreditResponse> AccreditInternalAsync(
        Guid assemblyId,
        Guid targetUserId,
        string presenceTypeRaw,
        string method,
        Guid? clientUnitId,
        CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var actorUserId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is not (AssemblyStatus.CheckIn or AssemblyStatus.InProgress or AssemblyStatus.Paused))
        {
            throw new DomainException(
                AttendanceCodes.AssemblyNotOpen,
                "La mesa de acreditación no está abierta. Un operador debe iniciar el check-in desde el panel de la asamblea.");
        }

        if (!Enum.TryParse<PresenceType>(presenceTypeRaw, ignoreCase: true, out var presenceType))
        {
            throw new DomainException($"Tipo de presencia desconocido '{presenceTypeRaw}'.");
        }

        var participant = await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == targetUserId, cancellationToken)
            ?? throw new DomainException("El participante no está inscrito en esta asamblea.");

        TenantGuard.EnsureTenantMatch(_currentTenant, participant.TenantId);

        if (participant.IsAccredited
            && Mapping.CountsTowardQuorum(participant.AttendanceStatus))
        {
            var existingReps = await _representation.GetActiveForUserAsync(assemblyId, targetUserId, cancellationToken);
            var latest = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
            return new AccreditResponse(
                participant.Id,
                participant.AttendanceStatus.ToString(),
                true,
                participant.AccreditedAtUtc ?? participant.CheckedInAtUtc ?? DateTimeOffset.UtcNow,
                participant.CheckedInAtUtc ?? DateTimeOffset.UtcNow,
                participant.EffectiveCoefficientPercent,
                existingReps.Select(r => new RepresentationUnitDto(
                    r.UnitId, r.UnitCode, r.CoefficientPercent, r.Source, r.PowerId, null)).ToList(),
                latest?.QuorumReached ?? false,
                latest?.CurrentCoefficient ?? 0m,
                latest?.RequiredCoefficient ?? 0m,
                IdempotentReplay: true);
        }

        IReadOnlyList<AssemblyRepresentationSnapshot> snapshots;
        if (!participant.IsAccredited)
        {
            snapshots = await _representation.MaterializeForAccreditationAsync(
                assemblyId,
                targetUserId,
                actorUserId,
                cancellationToken);
        }
        else
        {
            snapshots = await _representation.GetActiveForUserAsync(assemblyId, targetUserId, cancellationToken);
        }

        // Client-supplied UnitId is never trusted as coefficient authority — only validated against claims.
        if (clientUnitId is Guid requestedUnit
            && snapshots.Count > 0
            && snapshots.All(s => s.UnitId != requestedUnit))
        {
            throw new DomainException(
                AttendanceCodes.InvalidUnit,
                "Unit is not valid for this participant's accredited representation.");
        }

        if (clientUnitId is Guid orphanUnit && snapshots.Count == 0)
        {
            var unitOk = await _db.Units.AnyAsync(
                u => u.Id == orphanUnit
                     && u.TenantId == assembly.TenantId
                     && u.PropertyHorizontalId == assembly.PropertyHorizontalId,
                cancellationToken);
            if (!unitOk)
            {
                throw new DomainException(
                    AttendanceCodes.InvalidUnit,
                    "Unit is not valid for this assembly property.");
            }
        }

        var now = DateTimeOffset.UtcNow;
        var effective = Math.Round(
            snapshots.Sum(s => s.CoefficientPercent),
            4,
            MidpointRounding.AwayFromZero);

        participant.IsAccredited = true;
        participant.AccreditedAtUtc ??= now;
        participant.AccreditedByUserId ??= actorUserId;
        participant.EffectiveCoefficientPercent = effective;
        participant.AttendanceStatus = AttendanceStatus.CheckedIn;
        participant.CheckedInAtUtc ??= now;
        participant.PresenceType = presenceType;
        participant.UnitId = snapshots.FirstOrDefault()?.UnitId ?? participant.UnitId;
        participant.UpdatedAtUtc = now;

        _db.AttendanceRecords.Add(new AttendanceRecord
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            UserId = targetUserId,
            UnitId = participant.UnitId,
            PresenceType = presenceType,
            Status = AttendanceStatus.CheckedIn,
            TimestampUtc = now
        });

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            throw new DomainException(
                AttendanceCodes.RepresentationConflict,
                "Concurrent accreditation conflict: a unit representation was already claimed.",
                ex);
        }

        await _audit.WriteAsync(
            AuditEventType.ParticipantAccredited,
            assemblyId,
            metadata: new
            {
                TargetUserId = targetUserId,
                AccreditedBy = actorUserId,
                Method = method,
                EffectiveCoefficient = effective,
                Units = snapshots.Select(s => s.UnitCode).ToArray()
            },
            cancellationToken: cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.CheckIn,
            assemblyId,
            metadata: new { participant.UnitId, PresenceType = presenceType.ToString(), Method = method },
            cancellationToken: cancellationToken);

        if (snapshots.Count > 0)
        {
            await _audit.WriteAsync(
                AuditEventType.RepresentationAssigned,
                assemblyId,
                metadata: new
                {
                    TargetUserId = targetUserId,
                    Representations = snapshots
                },
                cancellationToken: cancellationToken);
        }

        var unitCode = await Mapping.ResolveUnitCodeAsync(_db, participant.UnitId, cancellationToken);
        await _realtime.PublishAttendanceAsync(
            assemblyId,
            Mapping.ToParticipantDto(participant, unitCode, effective, snapshots.Count),
            cancellationToken);

        var quorum = await _quorum.RecalculateAndSnapshotAsync(assemblyId, "CheckIn", cancellationToken);

        return new AccreditResponse(
            participant.Id,
            participant.AttendanceStatus.ToString(),
            true,
            participant.AccreditedAtUtc!.Value,
            participant.CheckedInAtUtc!.Value,
            effective,
            snapshots.Select(r => new RepresentationUnitDto(
                r.UnitId, r.UnitCode, r.CoefficientPercent, r.Source, r.PowerId, null)).ToList(),
            quorum.QuorumReached,
            quorum.CurrentCoefficient,
            quorum.RequiredCoefficient,
            IdempotentReplay: false);
    }

    public async Task<IReadOnlyList<AssemblyParticipantDto>> ListParticipantsAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var participants = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId)
            .OrderBy(p => p.DisplayName)
            .ToListAsync(cancellationToken);

        var userIds = participants.Select(p => p.UserId).ToList();
        var repCounts = await _db.AssemblyRepresentations
            .AsNoTracking()
            .Where(r => r.AssemblyId == assemblyId && r.IsActive && userIds.Contains(r.RepresentativeUserId))
            .GroupBy(r => r.RepresentativeUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        var unitIds = participants
            .Where(p => p.UnitId is not null)
            .Select(p => p.UnitId!.Value)
            .Distinct()
            .ToList();

        var unitMeta = unitIds.Count == 0
            ? new Dictionary<Guid, (string Code, decimal CoefficientPercent)>()
            : await _db.Units
                .AsNoTracking()
                .Where(u => unitIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => (u.Code, u.CoefficientPercent), cancellationToken);

        return participants
            .Select(p =>
            {
                string? code = null;
                decimal? coeff = p.IsAccredited ? p.EffectiveCoefficientPercent : null;
                if (p.UnitId is Guid uid && unitMeta.TryGetValue(uid, out var meta))
                {
                    code = meta.Code;
                    coeff ??= meta.CoefficientPercent;
                }

                var reps = repCounts.GetValueOrDefault(p.UserId, 0);
                return Mapping.ToParticipantDto(p, code, coeff, reps);
            })
            .ToList();
    }

    public async Task<AssemblyParticipantDto> MarkConnectedAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        return await UpdatePresenceAsync(
            assemblyId,
            userId,
            AttendanceStatus.Present,
            AuditEventType.ParticipantConnected,
            requireAccredited: true,
            cancellationToken);
    }

    public async Task<AssemblyParticipantDto> MarkDisconnectedAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        return await UpdatePresenceAsync(
            assemblyId,
            userId,
            AttendanceStatus.TemporarilyDisconnected,
            AuditEventType.ParticipantDisconnected,
            requireAccredited: true,
            cancellationToken);
    }

    private async Task<AssemblyParticipantDto> UpdatePresenceAsync(
        Guid assemblyId,
        Guid userId,
        AttendanceStatus status,
        string auditEventType,
        bool requireAccredited,
        CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var participant = await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("Participant is not registered for this assembly.");

        TenantGuard.EnsureTenantMatch(_currentTenant, participant.TenantId);

        // Connectivity telemetry must not invent legal attendance for non-accredited users.
        // Only accredited participants move Present ⇄ TemporarilyDisconnected.
        if (requireAccredited && !participant.IsAccredited)
        {
            var unitCodeEarly = await Mapping.ResolveUnitCodeAsync(_db, participant.UnitId, cancellationToken);
            return Mapping.ToParticipantDto(participant, unitCodeEarly, participant.EffectiveCoefficientPercent);
        }

        var now = DateTimeOffset.UtcNow;
        var previous = participant.AttendanceStatus;
        participant.AttendanceStatus = status;
        participant.UpdatedAtUtc = now;

        _db.AttendanceRecords.Add(new AttendanceRecord
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            UserId = userId,
            UnitId = participant.UnitId,
            PresenceType = participant.PresenceType ?? PresenceType.Virtual,
            Status = status,
            TimestampUtc = now
        });

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            auditEventType,
            assemblyId,
            metadata: new { userId, Status = status.ToString(), Previous = previous.ToString() },
            cancellationToken: cancellationToken);

        var unitCode = await Mapping.ResolveUnitCodeAsync(_db, participant.UnitId, cancellationToken);
        var dto = Mapping.ToParticipantDto(participant, unitCode, participant.EffectiveCoefficientPercent);
        await _realtime.PublishAttendanceAsync(assemblyId, dto, cancellationToken);

        // Only recalculate quorum when accredited presence changes.
        if (participant.IsAccredited)
        {
            await _quorum.RecalculateAndSnapshotAsync(assemblyId, status.ToString(), cancellationToken);
        }

        return dto;
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
    {
        var text = ex.InnerException?.Message ?? ex.Message;
        return text.Contains("unique", StringComparison.OrdinalIgnoreCase)
               || text.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
               || text.Contains("IX_assembly_representations", StringComparison.OrdinalIgnoreCase);
    }
}
