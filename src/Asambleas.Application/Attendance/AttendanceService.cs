namespace Asambleas.Application.Attendance;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Quorum;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Realtime;
using Asambleas.Contracts.Representation;
using Asambleas.Domain.Attendance;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Services;
using Microsoft.EntityFrameworkCore;

public sealed partial class AttendanceService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly QuorumService _quorum;
    private readonly IAssemblyRepresentationService _representation;
    private readonly IVerifiedJoinProofService _verifiedJoinProofs;

    public AttendanceService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime,
        QuorumService quorum,
        IAssemblyRepresentationService representation,
        IVerifiedJoinProofService verifiedJoinProofs)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
        _quorum = quorum;
        _representation = representation;
        _verifiedJoinProofs = verifiedJoinProofs;
    }

    /// <summary>
    /// Operator-only self accreditation alias. Owners cannot self-accredit (admin-only policy).
    /// Prefer <see cref="AccreditAsync"/> for mesa actions on other participants.
    /// </summary>
    public Task<AccreditResponse> CheckInAsync(
        Guid assemblyId,
        CheckInRequest request,
        CancellationToken cancellationToken = default)
    {
        EnsureCanManageAttendance();
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var method = string.IsNullOrWhiteSpace(request.Method) ? "OperatorSelfCheckIn" : request.Method.Trim();

        // Legacy VerifiedJoinLink / SelfCheckIn strings never authorize owners — manage permission already gated.
        if (string.Equals(method, "VerifiedJoinLink", StringComparison.OrdinalIgnoreCase)
            || string.Equals(method, "SelfCheckIn", StringComparison.OrdinalIgnoreCase))
        {
            method = "OperatorSelfCheckIn";
        }

        return AccreditInternalAsync(
            assemblyId,
            userId,
            request.PresenceType,
            method: method,
            clientUnitId: request.UnitId,
            cancellationToken);
    }

    /// <summary>Operator accreditation of a participant (does not invent presence / quorum).</summary>
    public Task<AccreditResponse> AccreditAsync(
        Guid assemblyId,
        Guid targetUserId,
        AccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        EnsureCanManageAttendance();
        return AccreditInternalAsync(
            assemblyId,
            targetUserId,
            request.PresenceType,
            method: request.Method ?? "OperatorCheckIn",
            clientUnitId: null,
            cancellationToken);
    }

    /// <summary>
    /// Marks the current user Present once accredited. Does not accredit.
    /// Used by room/lobby join and integration tests that lack a SignalR hub connection.
    /// </summary>
    public async Task<AssemblyParticipantDto> MarkSelfPresentAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var participant = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("El participante no está inscrito en esta asamblea.");

        if (!participant.IsAccredited)
        {
            throw new DomainException(
                AttendanceCodes.NotAccredited,
                "Su participación todavía está pendiente de validación administrativa.");
        }

        return await MarkConnectedAsync(assemblyId, userId, cancellationToken);
    }

    private void EnsureCanManageAttendance()
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        if (_currentTenant.Permissions.Any(p =>
                string.Equals(p, Permissions.AttendanceManage, StringComparison.Ordinal)))
        {
            return;
        }

        throw new DomainException(
            AttendanceCodes.SelfAccreditationForbidden,
            "La acreditación es exclusiva de la administración. Un operador autorizado debe acreditarlo.");
    }

    public async Task<DeaccreditResponse> DeaccreditAsync(
        Guid assemblyId,
        Guid targetUserId,
        DeaccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 5)
        {
            throw new DomainException("DEACCREDIT_REASON_REQUIRED", "Indique un motivo de al menos 5 caracteres.");
        }

        TenantGuard.EnsureAuthenticated(_currentTenant);
        var actorUserId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException(
                AttendanceCodes.AssemblyNotOpen,
                "No se puede corregir acreditación en una asamblea cerrada o cancelada.");
        }

        if (assembly.Status is AssemblyStatus.InProgress or AssemblyStatus.Paused or AssemblyStatus.CheckIn)
        {
            var openVoting = await _db.VotingSessions.AnyAsync(
                s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
                cancellationToken);
            if (openVoting)
            {
                throw new DomainException(
                    AttendanceCodes.DeaccreditBlockedVoting,
                    "No se puede quitar la acreditación mientras hay una votación abierta.");
            }
        }
        else
        {
            throw new DomainException(
                AttendanceCodes.AssemblyNotOpen,
                "La mesa no admite correcciones de acreditación en el estado actual.");
        }

        var participant = await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == targetUserId, cancellationToken)
            ?? throw new DomainException("El participante no está inscrito en esta asamblea.");

        if (!participant.IsAccredited)
        {
            throw new DomainException(
                AttendanceCodes.NotAccreditedForDeaccredit,
                "El participante no está acreditado.");
        }

        var previousCoeff = participant.EffectiveCoefficientPercent;
        var previousStatus = participant.AttendanceStatus.ToString();
        await _representation.RevokeActiveForUserAsync(assemblyId, targetUserId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        participant.IsAccredited = false;
        participant.AccreditedAtUtc = null;
        participant.AccreditedByUserId = null;
        participant.EffectiveCoefficientPercent = 0m;
        participant.AttendanceStatus = AttendanceStatus.Registered;
        participant.CheckedInAtUtc = null;
        participant.PresenceType = null;
        participant.UpdatedAtUtc = now;

        _db.AttendanceRecords.Add(new AttendanceRecord
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            UserId = targetUserId,
            UnitId = participant.UnitId,
            PresenceType = PresenceType.InPerson,
            Status = AttendanceStatus.Registered,
            TimestampUtc = now
        });

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.ParticipantDeaccredited,
            assemblyId,
            metadata: new
            {
                TargetUserId = targetUserId,
                DeaccreditedBy = actorUserId,
                Reason = request.Reason.Trim(),
                Method = request.Method ?? "OperatorDeaccredit",
                PreviousCoefficient = previousCoeff,
                PreviousAttendanceStatus = previousStatus,
                NewAttendanceStatus = AttendanceStatus.Registered.ToString(),
                PreviousIsAccredited = true,
                NewIsAccredited = false
            },
            cancellationToken: cancellationToken);

        var unitCode = await Mapping.ResolveUnitCodeAsync(_db, participant.UnitId, cancellationToken);
        await _realtime.PublishAttendanceAsync(
            assemblyId,
            Mapping.ToParticipantDto(participant, unitCode, 0m, 0),
            cancellationToken);

        await _realtime.PublishAccreditationChangedAsync(
            assemblyId,
            new AccreditationChangedDto(
                assemblyId,
                targetUserId,
                IsAccredited: false,
                AttendanceStatus: AttendanceStatus.Registered.ToString(),
                EffectiveCoefficientPercent: 0m,
                Message: "Su acreditación fue retirada por la administración. No podrá votar hasta una nueva validación.",
                PreviousAttendanceStatus: previousStatus,
                Reason: request.Reason.Trim()),
            cancellationToken);

        var quorum = await _quorum.RecalculateAndSnapshotAsync(assemblyId, "Deaccredit", cancellationToken);

        return new DeaccreditResponse(
            participant.Id,
            participant.AttendanceStatus.ToString(),
            false,
            previousCoeff,
            quorum.CurrentCoefficient,
            quorum.RequiredCoefficient,
            quorum.QuorumReached);
    }

    /// <summary>
    /// After a verified personal join link is redeemed/claimed and the desk is open, accredit once.
    /// Conflicts → no silent accredit (returns RequiresMesaValidation). Invitation alone never calls this.
    /// </summary>
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

        // Already accredited → idempotent (do not invent presence / alter quorum).
        if (participant.IsAccredited)
        {
            var existingReps = await _representation.GetActiveForUserAsync(assemblyId, targetUserId, cancellationToken);
            var latest = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
            var accreditedAt = participant.AccreditedAtUtc ?? DateTimeOffset.UtcNow;
            return new AccreditResponse(
                participant.Id,
                participant.AttendanceStatus.ToString(),
                true,
                accreditedAt,
                participant.CheckedInAtUtc ?? accreditedAt,
                participant.EffectiveCoefficientPercent,
                existingReps.Select(r => new RepresentationUnitDto(
                    r.UnitId, r.UnitCode, r.CoefficientPercent, r.Source, r.PowerId, null)).ToList(),
                latest?.QuorumReached ?? false,
                latest?.CurrentCoefficient ?? 0m,
                latest?.RequiredCoefficient ?? 0m,
                IdempotentReplay: true);
        }

        IReadOnlyList<AssemblyRepresentationSnapshot> snapshots;
        snapshots = await _representation.MaterializeForAccreditationAsync(
            assemblyId,
            targetUserId,
            actorUserId,
            cancellationToken);

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
        var previousStatus = participant.AttendanceStatus.ToString();
        var effective = Math.Round(
            snapshots.Sum(s => s.CoefficientPercent),
            4,
            MidpointRounding.AwayFromZero);

        // Accreditation ≠ presence. Keep Registered until the participant joins (MarkConnected).
        participant.IsAccredited = true;
        participant.AccreditedAtUtc = now;
        participant.AccreditedByUserId = actorUserId;
        participant.EffectiveCoefficientPercent = effective;
        participant.PresenceType = presenceType;
        participant.UnitId = snapshots.FirstOrDefault()?.UnitId ?? participant.UnitId;
        participant.UpdatedAtUtc = now;
        // Do not set AttendanceStatus=CheckedIn or CheckedInAtUtc — that would inflate quorum.

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
                Units = snapshots.Select(s => s.UnitCode).ToArray(),
                PreviousAttendanceStatus = previousStatus,
                NewAttendanceStatus = participant.AttendanceStatus.ToString(),
                PreviousIsAccredited = false,
                NewIsAccredited = true,
                PresenceType = presenceType.ToString(),
                UnitId = participant.UnitId
            },
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
        var dto = Mapping.ToParticipantDto(participant, unitCode, effective, snapshots.Count);
        await _realtime.PublishAttendanceAsync(assemblyId, dto, cancellationToken);

const string ownerMessage =
            "Su participación fue aprobada. Ya puede ingresar y votar cuando se habilite una votación.";
        await _realtime.PublishAccreditationChangedAsync(
            assemblyId,
            new AccreditationChangedDto(
                assemblyId,
                targetUserId,
                IsAccredited: true,
                AttendanceStatus: participant.AttendanceStatus.ToString(),
                EffectiveCoefficientPercent: effective,
                Message: ownerMessage,
                PreviousAttendanceStatus: previousStatus,
                AccreditedByUserId: actorUserId,
                AccreditedAtUtc: now),
            cancellationToken);

        // Quorum unchanged until effective presence (Present / CheckedIn / TemporarilyDisconnected).
        var quorum = await _quorum.RecalculateAndSnapshotAsync(assemblyId, "Accredit", cancellationToken);

        return new AccreditResponse(
            participant.Id,
            participant.AttendanceStatus.ToString(),
            true,
            participant.AccreditedAtUtc!.Value,
            participant.CheckedInAtUtc ?? participant.AccreditedAtUtc!.Value,
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

        if (AssemblyLifecycle.IsTerminal(assembly.Status))
        {
            throw new DomainException(
                "ASSEMBLY_SEALED",
                $"Presence cannot be updated while assembly is '{assembly.Status}'.");
        }

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
        if (status is AttendanceStatus.Present or AttendanceStatus.CheckedIn)
        {
            participant.CheckedInAtUtc ??= now;
            participant.PresenceType ??= PresenceType.Virtual;
        }

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
