namespace Asambleas.Application.Meeting;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Meetings;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class MeetingService
{
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
        bool canPublish = false,
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

        var token = await _meetingProvider.CreateParticipantTokenAsync(
            new MeetingJoinRequest(
                assemblyId,
                userId,
                participant.DisplayName,
                room.RoomName,
                CanPublish: canPublish,
                CanSubscribe: true),
            cancellationToken);

        return new MeetingJoinTokenResponse(
            token.AssemblyId,
            token.Provider,
            token.RoomName,
            token.Token,
            token.ServerUrl,
            token.ExpiresAtUtc);
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

        if (!await _meetingProvider.IsConfiguredAsync(cancellationToken))
        {
            return new MeetingRoomInfoDto(
                assemblyId,
                "livekit",
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
}
