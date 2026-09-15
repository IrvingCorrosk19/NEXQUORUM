namespace Asambleas.Application.Attendance;

using System.Collections.Concurrent;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Realtime;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Summons absent participants to join the live room ("Avisar para unirse").
/// SignalR is primary; optional outbound channels only when configured.
/// </summary>
public sealed class AssemblySummonService
{
    private static readonly TimeSpan Cooldown = TimeSpan.FromSeconds(60);
    private static readonly ConcurrentDictionary<string, DateTimeOffset> LastSummonUtc = new();

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly IAuditService _audit;

    public AssemblySummonService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAssemblyRealtimePublisher realtime,
        IAuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _realtime = realtime;
        _audit = audit;
    }

    public async Task<JoinSummonResultDto> SummonOneAsync(
        Guid assemblyId,
        Guid targetUserId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsureCanSummon();

        var assembly = await RequireLiveAssemblyAsync(assemblyId, cancellationToken);
        var participant = await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == targetUserId, cancellationToken)
            ?? throw new DomainException("PARTICIPANT_NOT_FOUND", "El participante no está en esta asamblea.");

        if (IsConnected(participant.AttendanceStatus))
        {
            return new JoinSummonResultDto(
                assemblyId,
                targetUserId,
                "SkippedConnected",
                "none",
                "El participante ya está conectado. No se envió un nuevo aviso.");
        }

        var key = $"{assemblyId:D}:{targetUserId:D}";
        var now = DateTimeOffset.UtcNow;
        if (LastSummonUtc.TryGetValue(key, out var last) && now - last < Cooldown)
        {
            var next = last + Cooldown;
            return new JoinSummonResultDto(
                assemblyId,
                targetUserId,
                "SkippedCooldown",
                "none",
                $"Espere {Math.Ceiling((next - now).TotalSeconds)} s antes de avisar de nuevo a esta persona.",
                next);
        }

        var phName = await _db.PropertyHorizontals.AsNoTracking()
            .Where(p => p.Id == assembly.PropertyHorizontalId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? "Propiedad";

        var summonedBy = _currentTenant.DisplayName ?? "Administración";
        var dto = new JoinSummonDto(
            assemblyId,
            targetUserId,
            assembly.Title,
            phName,
            "El presidente ha iniciado la asamblea y solicita que te unas",
            summonedBy,
            now,
            "signalr",
            Guid.NewGuid());

        await _realtime.PublishJoinSummonAsync(assemblyId, dto, cancellationToken);
        LastSummonUtc[key] = now;

        await _audit.WriteAsync(
            AuditEventType.ParticipantJoinSummoned,
            assemblyId,
            metadata: new
            {
                TargetUserId = targetUserId,
                TargetDisplayName = participant.DisplayName,
                Channel = "signalr",
                Status = "Notified"
            },
            cancellationToken: cancellationToken);

        return new JoinSummonResultDto(assemblyId, targetUserId, "Notified", "signalr", "Aviso enviado en tiempo real.");
    }

    public async Task<JoinSummonBatchResultDto> SummonAbsentAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsureCanSummon();
        await RequireLiveAssemblyAsync(assemblyId, cancellationToken);

        var participants = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId)
            .Select(p => new { p.UserId, p.AttendanceStatus })
            .ToListAsync(cancellationToken);

        var results = new List<JoinSummonResultDto>();
        var notified = 0;
        var skippedConnected = 0;
        var skippedCooldown = 0;
        var failed = 0;

        foreach (var p in participants)
        {
            if (IsConnected(p.AttendanceStatus))
            {
                skippedConnected++;
                results.Add(new JoinSummonResultDto(assemblyId, p.UserId, "SkippedConnected", "none"));
                continue;
            }

            try
            {
                var r = await SummonOneAsync(assemblyId, p.UserId, cancellationToken);
                results.Add(r);
                if (r.Status == "Notified") notified++;
                else if (r.Status == "SkippedCooldown") skippedCooldown++;
                else if (r.Status == "SkippedConnected") skippedConnected++;
                else failed++;
            }
            catch (Exception)
            {
                failed++;
                results.Add(new JoinSummonResultDto(
                    assemblyId,
                    p.UserId,
                    "Error",
                    "none",
                    "No fue posible avisar a este participante."));
            }
        }

        return new JoinSummonBatchResultDto(
            assemblyId,
            participants.Count,
            notified,
            skippedConnected,
            skippedCooldown,
            failed,
            results);
    }

    private void EnsureCanSummon()
    {
        var perms = _currentTenant.Permissions;
        if (perms.Contains(Permissions.MeetingModerate)
            || perms.Contains(Permissions.AssemblyManage)
            || perms.Contains(Permissions.AssemblyStart)
            || perms.Contains(Permissions.AttendanceManage))
        {
            return;
        }

        throw new DomainException("FORBIDDEN", "No tiene permiso para avisar participantes.");
    }

    private async Task<Domain.Entities.Assembly> RequireLiveAssemblyAsync(
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
                "Solo puede avisar participantes mientras la mesa o la asamblea estén abiertas.");
        }

        return assembly;
    }

    private static bool IsConnected(AttendanceStatus status) =>
        status is AttendanceStatus.Present or AttendanceStatus.CheckedIn;
}
