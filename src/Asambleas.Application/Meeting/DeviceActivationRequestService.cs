namespace Asambleas.Application.Meeting;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Realtime;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Browser-safe moderation: request that a participant enable mic/camera.
/// Never claims remote devices were forced on.
/// </summary>
public sealed class DeviceActivationRequestService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly IAuditService _audit;

    public DeviceActivationRequestService(
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

    public async Task RequestAsync(
        Guid assemblyId,
        Guid? targetUserId,
        string device,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsureCanModerate();

        var normalized = device?.Trim().ToLowerInvariant();
        if (normalized is not ("microphone" or "camera"))
        {
            throw new DomainException("INVALID_DEVICE", "Dispositivo no válido. Use microphone o camera.");
        }

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var by = _currentTenant.DisplayName ?? "Mesa";
        var message = normalized == "microphone"
            ? "El presidente solicita que actives tu micrófono."
            : "El presidente solicita que actives tu cámara.";

        if (targetUserId is null || targetUserId == Guid.Empty)
        {
            // Broadcast request-to-all (still a request, not force mute/unmute).
            var participants = await _db.AssemblyParticipants.AsNoTracking()
                .Where(p => p.AssemblyId == assemblyId
                            && p.AttendanceStatus == AttendanceStatus.Present)
                .Select(p => p.UserId)
                .ToListAsync(cancellationToken);

            foreach (var uid in participants)
            {
                if (uid == _currentTenant.UserId) continue;
                await EmitAsync(assemblyId, uid, normalized, message, by, cancellationToken);
            }

            await _audit.WriteAsync(
                "DEVICE_ACTIVATION_REQUESTED_ALL",
                assemblyId,
                metadata: new { Device = normalized, Count = participants.Count },
                cancellationToken: cancellationToken);
            return;
        }

        await EmitAsync(assemblyId, targetUserId.Value, normalized, message, by, cancellationToken);
        await _audit.WriteAsync(
            "DEVICE_ACTIVATION_REQUESTED",
            assemblyId,
            metadata: new { TargetUserId = targetUserId, Device = normalized },
            cancellationToken: cancellationToken);
    }

    private async Task EmitAsync(
        Guid assemblyId,
        Guid targetUserId,
        string device,
        string message,
        string by,
        CancellationToken cancellationToken)
    {
        await _realtime.PublishDeviceActivationRequestedAsync(
            assemblyId,
            new DeviceActivationRequestDto(
                assemblyId,
                targetUserId,
                device,
                message,
                by,
                DateTimeOffset.UtcNow),
            cancellationToken);
    }

    private void EnsureCanModerate()
    {
        var p = _currentTenant.Permissions;
        if (p.Contains(Permissions.MeetingModerate)
            || p.Contains(Permissions.AssemblyManage)
            || p.Contains(Permissions.AssemblyStart))
        {
            return;
        }

        throw new DomainException("FORBIDDEN", "No tiene permiso para solicitar activación de dispositivos.");
    }
}
