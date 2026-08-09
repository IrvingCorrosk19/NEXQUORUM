namespace Asambleas.Application.Meeting;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Meetings;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class MeetingService
{
    public static readonly TimeSpan DefaultTokenTtl = TimeSpan.FromMinutes(15);

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IMeetingProvider _meetingProvider;

    public MeetingService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IMeetingProvider meetingProvider)
    {
        _db = db;
        _currentTenant = currentTenant;
        _meetingProvider = meetingProvider;
    }

    public async Task<MeetingJoinTokenResponse> GetJoinInfoAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is AssemblyStatus.Draft or AssemblyStatus.Cancelled or AssemblyStatus.Completed)
        {
            throw new DomainException($"Meeting join is not available while assembly is '{assembly.Status}'.");
        }

        var participant = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("Participant is not registered for this assembly.");

        if (!await _meetingProvider.IsConfiguredAsync(cancellationToken))
        {
            throw new DomainException("Meeting provider is not configured (LiveKit credentials required).");
        }

        var roomName = $"assembly-{assemblyId:N}";
        var room = await _meetingProvider.EnsureRoomAsync(assemblyId, roomName, cancellationToken);

        if (!room.IsAvailable)
        {
            throw new DomainException(room.UnavailableReason ?? "Meeting room is unavailable.");
        }

        var canPublish = await ResolveCanPublishAsync(assemblyId, userId, participant.RoleCode, cancellationToken);

        var token = await _meetingProvider.CreateParticipantTokenAsync(
            new MeetingJoinRequest(
                assemblyId,
                userId,
                participant.DisplayName,
                room.RoomName,
                CanPublish: canPublish,
                CanSubscribe: true,
                Ttl: DefaultTokenTtl),
            cancellationToken);

        return new MeetingJoinTokenResponse(
            token.AssemblyId,
            token.Provider,
            token.RoomName,
            token.Token,
            token.ServerUrl,
            token.ExpiresAtUtc,
            CanPublish: canPublish,
            Identity: userId.ToString("N"));
    }

    public async Task<MeetingRoomInfoDto> GetRoomInfoAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var roomName = $"assembly-{assemblyId:N}";
        var providerName = await _meetingProvider.IsConfiguredAsync(cancellationToken)
            ? (await _meetingProvider.EnsureRoomAsync(assemblyId, roomName, cancellationToken)).Provider
            : "none";

        if (!await _meetingProvider.IsConfiguredAsync(cancellationToken))
        {
            return new MeetingRoomInfoDto(
                assemblyId,
                providerName,
                roomName,
                false,
                "Meeting provider is not configured (LiveKit credentials required).");
        }

        var room = await _meetingProvider.EnsureRoomAsync(assemblyId, roomName, cancellationToken);

        return new MeetingRoomInfoDto(
            room.AssemblyId,
            room.Provider,
            room.RoomName,
            room.IsAvailable,
            room.UnavailableReason);
    }

    /// <summary>
    /// Publish is server-derived: moderators always; owners only while they hold the floor.
    /// Client query flags are never trusted.
    /// </summary>
    public static bool CanPublishFromRole(string roleCode) =>
        RolePermissionMap.HasPermission([roleCode], Permissions.MeetingModerate);

    private async Task<bool> ResolveCanPublishAsync(
        Guid assemblyId,
        Guid userId,
        string roleCode,
        CancellationToken cancellationToken)
    {
        if (CanPublishFromRole(roleCode))
        {
            return true;
        }

        return await _db.SpeakerRequests
            .AsNoTracking()
            .AnyAsync(
                s => s.AssemblyId == assemblyId
                     && s.UserId == userId
                     && s.Status == SpeakerRequestStatus.Granted,
                cancellationToken);
    }
}
