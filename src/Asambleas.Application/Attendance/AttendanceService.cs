namespace Asambleas.Application.Attendance;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Quorum;
using Asambleas.Contracts.Assemblies;
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

    public AttendanceService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime,
        QuorumService quorum)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
        _quorum = quorum;
    }

    public async Task<CheckInResponse> CheckInAsync(
        Guid assemblyId,
        CheckInRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is not (AssemblyStatus.CheckIn or AssemblyStatus.InProgress or AssemblyStatus.Paused))
        {
            throw new DomainException($"Check-in is not allowed while assembly is '{assembly.Status}'.");
        }

        if (!Enum.TryParse<PresenceType>(request.PresenceType, ignoreCase: true, out var presenceType))
        {
            throw new DomainException($"Unknown presence type '{request.PresenceType}'.");
        }

        var participant = await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("Participant is not registered for this assembly.");

        TenantGuard.EnsureTenantMatch(_currentTenant, participant.TenantId);

        if (request.UnitId is Guid unitId)
        {
            var unitOk = await _db.Units.AnyAsync(
                u => u.Id == unitId && u.TenantId == assembly.TenantId && u.PropertyHorizontalId == assembly.PropertyHorizontalId,
                cancellationToken);

            if (!unitOk)
            {
                throw new DomainException("Unit is not valid for this assembly property.");
            }

            participant.UnitId = unitId;
        }

        var now = DateTimeOffset.UtcNow;
        participant.AttendanceStatus = AttendanceStatus.CheckedIn;
        participant.CheckedInAtUtc ??= now;
        participant.UpdatedAtUtc = now;

        _db.AttendanceRecords.Add(new AttendanceRecord
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            UserId = userId,
            UnitId = participant.UnitId,
            PresenceType = presenceType,
            Status = AttendanceStatus.CheckedIn,
            TimestampUtc = now
        });

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.CheckIn,
            assemblyId,
            metadata: new { participant.UnitId, PresenceType = presenceType.ToString() },
            cancellationToken: cancellationToken);

        var unitCode = await Mapping.ResolveUnitCodeAsync(_db, participant.UnitId, cancellationToken);
        await _realtime.PublishAttendanceAsync(assemblyId, Mapping.ToParticipantDto(participant, unitCode), cancellationToken);

        await _quorum.RecalculateAndSnapshotAsync(assemblyId, cancellationToken);

        return new CheckInResponse(participant.Id, participant.AttendanceStatus.ToString(), participant.CheckedInAtUtc!.Value);
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
                decimal? coeff = null;
                if (p.UnitId is Guid uid && unitMeta.TryGetValue(uid, out var meta))
                {
                    code = meta.Code;
                    coeff = meta.CoefficientPercent;
                }

                return Mapping.ToParticipantDto(p, code, coeff);
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

        var participant = await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("Participant is not registered for this assembly.");

        TenantGuard.EnsureTenantMatch(_currentTenant, participant.TenantId);

        var now = DateTimeOffset.UtcNow;
        participant.AttendanceStatus = status;
        participant.UpdatedAtUtc = now;

        _db.AttendanceRecords.Add(new AttendanceRecord
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            UserId = userId,
            UnitId = participant.UnitId,
            PresenceType = PresenceType.Virtual,
            Status = status,
            TimestampUtc = now
        });

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            auditEventType,
            assemblyId,
            metadata: new { userId, Status = status.ToString() },
            cancellationToken: cancellationToken);

        var unitCode = await Mapping.ResolveUnitCodeAsync(_db, participant.UnitId, cancellationToken);
        var dto = Mapping.ToParticipantDto(participant, unitCode);
        await _realtime.PublishAttendanceAsync(assemblyId, dto, cancellationToken);

        await _quorum.RecalculateAndSnapshotAsync(assemblyId, cancellationToken);

        return dto;
    }
}
