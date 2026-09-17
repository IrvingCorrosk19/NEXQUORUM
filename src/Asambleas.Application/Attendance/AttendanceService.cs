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
    /// Deprecated. Accreditation was removed — convocation authorizes and presence drives quorum.
    /// </summary>
    public Task<AccreditResponse> CheckInAsync(
        Guid assemblyId,
        CheckInRequest request,
        CancellationToken cancellationToken = default)
    {
        throw AccreditationRemoved();
    }

    /// <summary>
    /// Deprecated. Accreditation was removed — convocation authorizes and presence drives quorum.
    /// </summary>
    public Task<AccreditResponse> AccreditAsync(
        Guid assemblyId,
        Guid targetUserId,
        AccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        throw AccreditationRemoved();
    }

    /// <summary>
    /// Marks the current user Present after valid enrollment/convocation. Materializes unit representations on first join.
    /// </summary>
    public async Task<AssemblyParticipantDto> MarkSelfPresentAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var userId = TenantGuard.RequireUserId(_currentTenant);
        _ = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("El participante no está inscrito en esta asamblea.");

        return await MarkConnectedAsync(assemblyId, userId, cancellationToken);
    }

    private static DomainException AccreditationRemoved() =>
        new(
            AttendanceCodes.AccreditationRemoved,
            "La acreditación fue eliminada. La convocatoria válida autoriza el ingreso; la presencia registra quórum y voto.");

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
            "No tiene permiso para gestionar asistencia.");
    }

    /// <summary>Deprecated. Accreditation was removed.</summary>
    public Task<DeaccreditResponse> DeaccreditAsync(
        Guid assemblyId,
        Guid targetUserId,
        DeaccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        throw AccreditationRemoved();
    }

    public Task<RepresentationPreviewDto> PreviewAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default) =>
        _representation.PreviewAsync(assemblyId, userId, cancellationToken);

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
                decimal? coeff = Mapping.CountsTowardQuorum(p.AttendanceStatus)
                    ? p.EffectiveCoefficientPercent
                    : null;
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
            cancellationToken);
    }

    private async Task<AssemblyParticipantDto> UpdatePresenceAsync(
        Guid assemblyId,
        Guid userId,
        AttendanceStatus status,
        string auditEventType,
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

        var now = DateTimeOffset.UtcNow;
        var previous = participant.AttendanceStatus;

        // On first effective presence, freeze unit representations (convocation authorizes; no mesa accredit).
        if (status is AttendanceStatus.Present or AttendanceStatus.CheckedIn)
        {
            await EnsureRepresentationsOnJoinAsync(assemblyId, participant, userId, cancellationToken);
        }

        participant.AttendanceStatus = status;
        participant.UpdatedAtUtc = now;
        if (status is AttendanceStatus.Present or AttendanceStatus.CheckedIn)
        {
            participant.CheckedInAtUtc ??= now;
            participant.PresenceType ??= PresenceType.Virtual;
            participant.RoomEntryStatus = RoomEntryStatus.Admitted;
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

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            throw new DomainException(
                AttendanceCodes.RepresentationConflict,
                "Concurrent representation conflict: a unit was already claimed.",
                ex);
        }

        await _audit.WriteAsync(
            auditEventType,
            assemblyId,
            metadata: new
            {
                userId,
                Status = status.ToString(),
                Previous = previous.ToString(),
                UnitId = participant.UnitId,
                EffectiveCoefficient = participant.EffectiveCoefficientPercent
            },
            cancellationToken: cancellationToken);

        var unitCode = await Mapping.ResolveUnitCodeAsync(_db, participant.UnitId, cancellationToken);
        var dto = Mapping.ToParticipantDto(participant, unitCode, participant.EffectiveCoefficientPercent);
        await _realtime.PublishAttendanceAsync(assemblyId, dto, cancellationToken);

        await _quorum.RecalculateAndSnapshotAsync(assemblyId, status.ToString(), cancellationToken);

        return dto;
    }

    /// <summary>
    /// Materializes active unit representations on first join. Idempotent if already present.
    /// Operators without ownership claims skip silently.
    /// </summary>
    private async Task EnsureRepresentationsOnJoinAsync(
        Guid assemblyId,
        AssemblyParticipant participant,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var existing = await _representation.GetActiveForUserAsync(assemblyId, userId, cancellationToken);
        if (existing.Count > 0)
        {
            participant.EffectiveCoefficientPercent = Math.Round(
                existing.Sum(r => r.CoefficientPercent),
                4,
                MidpointRounding.AwayFromZero);
            participant.UnitId ??= existing[0].UnitId;
            return;
        }

        try
        {
            var snapshots = await _representation.MaterializeForAccreditationAsync(
                assemblyId,
                userId,
                accreditedByUserId: userId,
                cancellationToken);

            if (snapshots.Count == 0)
            {
                return;
            }

            participant.EffectiveCoefficientPercent = Math.Round(
                snapshots.Sum(s => s.CoefficientPercent),
                4,
                MidpointRounding.AwayFromZero);
            participant.UnitId = snapshots[0].UnitId;
            participant.PresenceType ??= PresenceType.Virtual;

            await _audit.WriteAsync(
                AuditEventType.RepresentationAssigned,
                assemblyId,
                metadata: new
                {
                    TargetUserId = userId,
                    Source = "JoinPresence",
                    Representations = snapshots
                },
                cancellationToken: cancellationToken);
        }
        catch (DomainException ex) when (
            ex.Code is AttendanceCodes.NoEligibleRepresentation
                or AttendanceCodes.OwnerDraft
                or AttendanceCodes.OwnerInactive
                or AttendanceCodes.OwnerMissingUnits
                or AttendanceCodes.RequiresMesaValidation)
        {
            // Operators / guests without unit claims may still observe presence without coefficient.
            if (IsOperatorRole(participant.RoleCode))
            {
                return;
            }

            throw;
        }
    }

    private static bool IsOperatorRole(string? roleCode) =>
        roleCode is Roles.AssemblyPresident
            or Roles.AssemblySecretary
            or Roles.AssemblyOperator
            or Roles.PHAdmin
            or Roles.TenantAdmin
            or Roles.PlatformAdmin;

    private static bool IsUniqueViolation(DbUpdateException ex)
    {
        var text = ex.InnerException?.Message ?? ex.Message;
        return text.Contains("unique", StringComparison.OrdinalIgnoreCase)
               || text.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
               || text.Contains("IX_assembly_representations", StringComparison.OrdinalIgnoreCase);
    }
}
