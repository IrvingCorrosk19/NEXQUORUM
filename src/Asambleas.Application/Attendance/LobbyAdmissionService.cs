namespace Asambleas.Application.Attendance;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Realtime;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Teams-like lobby admission (Waiting / Admitted / Rejected).
/// Complements accreditation; never grants quorum or vote by itself.
/// </summary>
public sealed class LobbyAdmissionService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly IAuditService _audit;
    private readonly IAssemblyHubPresence _hubPresence;

    public LobbyAdmissionService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAssemblyRealtimePublisher realtime,
        IAuditService audit,
        IAssemblyHubPresence hubPresence)
    {
        _db = db;
        _currentTenant = currentTenant;
        _realtime = realtime;
        _audit = audit;
        _hubPresence = hubPresence;
    }

    public async Task<AssemblyParticipantDto> RequestEntryAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = _currentTenant.UserId
            ?? throw new DomainException("UNAUTHORIZED", "Debe iniciar sesión.");

        var assembly = await RequireJoinableAsync(assemblyId, cancellationToken);
        var participant = await RequireParticipantAsync(assemblyId, userId, cancellationToken);

        if (IsOperator())
        {
            return await AdmitCoreAsync(assembly, participant, auto: true, cancellationToken);
        }

        if (!participant.IsAccredited)
        {
            throw new DomainException(
                "NOT_ACCREDITED",
                "Todavía no está acreditado. Espere la validación de la mesa antes de solicitar ingreso.");
        }

        if (participant.RoomEntryStatus == RoomEntryStatus.Admitted)
        {
            return Map(participant);
        }

        participant.RoomEntryStatus = RoomEntryStatus.Waiting;
        participant.RoomEntryRequestedAtUtc = DateTimeOffset.UtcNow;
        participant.RoomEntryRejectReason = null;
        participant.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var dto = Map(participant);
        await _realtime.PublishAttendanceAsync(assemblyId, dto, cancellationToken);
        await _realtime.PublishRoomEntryChangedAsync(
            assemblyId,
            new RoomEntryChangedDto(
                assemblyId,
                userId,
                participant.DisplayName,
                RoomEntryStatus.Waiting.ToString(),
                "Esperando que el presidente te admita.",
                AtUtc: DateTimeOffset.UtcNow),
            cancellationToken);

        return dto;
    }

    public async Task<AssemblyParticipantDto> CancelEntryRequestAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = _currentTenant.UserId
            ?? throw new DomainException("UNAUTHORIZED", "Debe iniciar sesión.");

        await RequireJoinableAsync(assemblyId, cancellationToken);
        var participant = await RequireParticipantAsync(assemblyId, userId, cancellationToken);

        if (participant.RoomEntryStatus is not (RoomEntryStatus.Waiting or RoomEntryStatus.Rejected))
        {
            return Map(participant);
        }

        participant.RoomEntryStatus = RoomEntryStatus.None;
        participant.RoomEntryRequestedAtUtc = null;
        participant.RoomEntryRejectReason = null;
        participant.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var dto = Map(participant);
        await _realtime.PublishAttendanceAsync(assemblyId, dto, cancellationToken);
        await _realtime.PublishRoomEntryChangedAsync(
            assemblyId,
            new RoomEntryChangedDto(
                assemblyId,
                userId,
                participant.DisplayName,
                RoomEntryStatus.None.ToString(),
                "Solicitud de ingreso cancelada.",
                AtUtc: DateTimeOffset.UtcNow),
            cancellationToken);
        return dto;
    }

    public async Task<AssemblyParticipantDto> AdmitAsync(
        Guid assemblyId,
        Guid targetUserId,
        CancellationToken cancellationToken = default)
    {
        EnsureCanModerate();
        var assembly = await RequireJoinableAsync(assemblyId, cancellationToken);
        var participant = await RequireParticipantAsync(assemblyId, targetUserId, cancellationToken);
        return await AdmitCoreAsync(assembly, participant, auto: false, cancellationToken);
    }

    public async Task<IReadOnlyList<AssemblyParticipantDto>> AdmitAllAuthorizedAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        EnsureCanModerate();
        var assembly = await RequireJoinableAsync(assemblyId, cancellationToken);
        var waiting = await _db.AssemblyParticipants
            .Where(p => p.AssemblyId == assemblyId
                        && p.IsAccredited
                        && p.RoomEntryStatus == RoomEntryStatus.Waiting)
            .ToListAsync(cancellationToken);

        var results = new List<AssemblyParticipantDto>();
        foreach (var p in waiting)
        {
            results.Add(await AdmitCoreAsync(assembly, p, auto: false, cancellationToken));
        }

        return results;
    }

    public async Task<AssemblyParticipantDto> RejectAsync(
        Guid assemblyId,
        Guid targetUserId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        EnsureCanModerate();
        await RequireJoinableAsync(assemblyId, cancellationToken);
        var participant = await RequireParticipantAsync(assemblyId, targetUserId, cancellationToken);

        var rejectReason = string.IsNullOrWhiteSpace(reason)
            ? "Entrada rechazada por la mesa."
            : reason.Trim();
        if (rejectReason.Length > 500)
        {
            rejectReason = rejectReason[..500];
        }

        participant.RoomEntryStatus = RoomEntryStatus.Rejected;
        participant.RoomEntryRejectReason = rejectReason;
        participant.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.ParticipantRejected,
            assemblyId,
            metadata: new
            {
                TargetUserId = targetUserId,
                TargetDisplayName = participant.DisplayName,
                Reason = rejectReason
            },
            cancellationToken: cancellationToken);

        var dto = Map(participant);
        await _realtime.PublishAttendanceAsync(assemblyId, dto, cancellationToken);
        await _realtime.PublishRoomEntryChangedAsync(
            assemblyId,
            new RoomEntryChangedDto(
                assemblyId,
                targetUserId,
                participant.DisplayName,
                RoomEntryStatus.Rejected.ToString(),
                "Tu solicitud de ingreso fue rechazada.",
                rejectReason,
                DateTimeOffset.UtcNow),
            cancellationToken);
        return dto;
    }

    public async Task<IReadOnlyList<AssemblyParticipantDto>> ListWaitingAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        EnsureCanModerate();
        await RequireJoinableAsync(assemblyId, cancellationToken);
        var list = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId && p.RoomEntryStatus == RoomEntryStatus.Waiting)
            .OrderBy(p => p.RoomEntryRequestedAtUtc)
            .ToListAsync(cancellationToken);
        return list.Select(Map).ToList();
    }

    private async Task<AssemblyParticipantDto> AdmitCoreAsync(
        Domain.Entities.Assembly assembly,
        Domain.Entities.AssemblyParticipant participant,
        bool auto,
        CancellationToken cancellationToken)
    {
        if (!participant.IsAccredited && !auto)
        {
            throw new DomainException(
                "NOT_ACCREDITED",
                "Solo se puede admitir a participantes acreditados.");
        }

        participant.RoomEntryStatus = RoomEntryStatus.Admitted;
        participant.RoomEntryRejectReason = null;
        participant.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var dto = Map(participant);
        await _realtime.PublishAttendanceAsync(assembly.Id, dto, cancellationToken);
        await _realtime.PublishRoomEntryChangedAsync(
            assembly.Id,
            new RoomEntryChangedDto(
                assembly.Id,
                participant.UserId,
                participant.DisplayName,
                RoomEntryStatus.Admitted.ToString(),
                auto
                    ? "Ingreso autorizado (mesa)."
                    : "El presidente te ha admitido. Entrando a la asamblea…",
                AtUtc: DateTimeOffset.UtcNow),
            cancellationToken);
        return dto;
    }

    private AssemblyParticipantDto Map(Domain.Entities.AssemblyParticipant p)
    {
        var dto = Mapping.ToParticipantDto(p);
        return dto with
        {
            IsHubConnected = _hubPresence.IsHubConnected(p.AssemblyId, p.UserId)
        };
    }

    private bool IsOperator()
    {
        var p = _currentTenant.Permissions;
        return p.Contains(Permissions.MeetingModerate)
            || p.Contains(Permissions.AssemblyManage)
            || p.Contains(Permissions.AssemblyStart)
            || p.Contains(Permissions.AttendanceManage);
    }

    private void EnsureCanModerate()
    {
        if (!IsOperator())
        {
            throw new DomainException("FORBIDDEN", "No tiene permiso para admitir o rechazar participantes.");
        }
    }

    private async Task<Domain.Entities.Assembly> RequireJoinableAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        if (assembly.Status is not (AssemblyStatus.CheckIn or AssemblyStatus.InProgress or AssemblyStatus.Paused))
        {
            throw new DomainException(
                "ASSEMBLY_NOT_JOINABLE",
                "La admisión solo aplica mientras la mesa o la asamblea estén abiertas.");
        }

        return assembly;
    }

    private async Task<Domain.Entities.AssemblyParticipant> RequireParticipantAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        return await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("PARTICIPANT_NOT_FOUND", "El participante no está en esta asamblea.");
    }
}
