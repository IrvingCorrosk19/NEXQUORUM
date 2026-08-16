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
    private readonly IScreenShareCoordinator _screenShare;
    private readonly IAssemblyRealtimePublisher _realtime;

    public MeetingService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IMeetingProvider meetingProvider,
        IScreenShareCoordinator screenShare,
        IAssemblyRealtimePublisher realtime)
    {
        _db = db;
        _currentTenant = currentTenant;
        _meetingProvider = meetingProvider;
        _screenShare = screenShare;
        _realtime = realtime;
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

        if (assembly.Status is AssemblyStatus.Draft
            or AssemblyStatus.Scheduled
            or AssemblyStatus.Cancelled
            or AssemblyStatus.Completed)
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
        var canScreen = CanScreenShareFromClaimsOrRole(participant.RoleCode);

        var token = await _meetingProvider.CreateParticipantTokenAsync(
            new MeetingJoinRequest(
                assemblyId,
                userId,
                participant.DisplayName,
                room.RoomName,
                CanPublish: canPublish,
                CanSubscribe: true,
                CanPublishScreenShare: canScreen,
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
            Identity: userId.ToString("N"),
            CanPublishScreenShare: canScreen);
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

    public async Task<ScreenShareStateDto> GetScreenShareStateAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var ctx = await RequireLiveParticipantAsync(assemblyId, cancellationToken);
        return Annotate(assemblyId, _screenShare.TryGet(assemblyId), ctx.UserId, ctx.CanScreenShare, ctx.CanForceStop);
    }

    public async Task<StartScreenShareResponse> StartScreenShareAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var ctx = await RequireLiveParticipantAsync(assemblyId, cancellationToken);
        if (!ctx.CanScreenShare)
        {
            throw new DomainException(
                "SCREEN_SHARE_FORBIDDEN",
                "No tienes permiso para compartir pantalla en esta asamblea.");
        }

        if (!_screenShare.TryClaim(
                assemblyId,
                ctx.UserId,
                ctx.DisplayName,
                out var claimed,
                out var conflict)
            && conflict is not null)
        {
            throw new DomainException(
                "SCREEN_SHARE_ACTIVE",
                $"Hay una presentación activa de {conflict.PresenterDisplayName}.");
        }

        var state = Annotate(assemblyId, claimed, ctx.UserId, ctx.CanScreenShare, ctx.CanForceStop);
        await _realtime.PublishScreenShareUpdatedAsync(assemblyId, state, cancellationToken);
        return new StartScreenShareResponse(state);
    }

    public async Task<StopScreenShareResponse> StopScreenShareAsync(
        Guid assemblyId,
        bool force,
        CancellationToken cancellationToken = default)
    {
        var ctx = await RequireLiveParticipantAsync(assemblyId, cancellationToken);
        var allowForce = force && ctx.CanForceStop;
        if (!_screenShare.TryRelease(assemblyId, ctx.UserId, allowForce, out var released))
        {
            throw new DomainException(
                "SCREEN_SHARE_NOT_OWNER",
                "Solo el presentador o un moderador puede detener esta presentación.");
        }

        var state = Annotate(assemblyId, released.IsActive ? released : null, ctx.UserId, ctx.CanScreenShare, ctx.CanForceStop);
        await _realtime.PublishScreenShareUpdatedAsync(assemblyId, state, cancellationToken);
        return new StopScreenShareResponse(state);
    }

    public ScreenShareStateDto GetScreenShareSnapshot(Guid assemblyId, Guid? viewerUserId, bool canStart, bool canForceStop) =>
        Annotate(assemblyId, _screenShare.TryGet(assemblyId), viewerUserId, canStart, canForceStop);

    public void ClearScreenShare(Guid assemblyId) => _screenShare.Clear(assemblyId);

    /// <summary>
    /// When the active presenter leaves the hub, clear share state so the room does not stay stuck.
    /// </summary>
    public async Task ClearIfPresenterLeftAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var current = _screenShare.TryGet(assemblyId);
        if (current is null || !current.IsActive || current.PresenterUserId != userId)
        {
            return;
        }

        _screenShare.Clear(assemblyId);
        var state = new ScreenShareStateDto(
            assemblyId,
            IsActive: false,
            PresenterUserId: null,
            PresenterDisplayName: null,
            StartedAtUtc: null,
            CurrentUserCanStart: false,
            CurrentUserIsPresenter: false,
            CurrentUserCanForceStop: false);
        await _realtime.PublishScreenShareUpdatedAsync(assemblyId, state, cancellationToken);
    }

    /// <summary>
    /// Moderators always have elevated meeting controls. Media publish for the video
    /// conference is granted separately to all registered join participants (see
    /// <see cref="ResolveCanPublishAsync"/>); governance floor is not used to gate A/V.
    /// </summary>
    public static bool CanPublishFromRole(string roleCode) =>
        RolePermissionMap.HasPermission([roleCode], Permissions.MeetingModerate);

    public static bool CanScreenShareFromClaimsOrRole(string roleCode) =>
        RolePermissionMap.HasPermission([roleCode], Permissions.MeetingScreenShare)
        || RolePermissionMap.HasPermission([roleCode], Permissions.MeetingModerate);

    private Task<bool> ResolveCanPublishAsync(
        Guid assemblyId,
        Guid userId,
        string roleCode,
        CancellationToken cancellationToken)
    {
        _ = assemblyId;
        _ = userId;
        _ = roleCode;
        _ = cancellationToken;
        return Task.FromResult(true);
    }

    private async Task<ParticipantCtx> RequireLiveParticipantAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException("La asamblea ya no admite compartir pantalla.");
        }

        var participant = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("Participant is not registered for this assembly.");

        var canScreen = CanScreenShareFromClaimsOrRole(participant.RoleCode)
            || _currentTenant.Permissions.Contains(Permissions.MeetingScreenShare)
            || _currentTenant.Permissions.Contains(Permissions.MeetingModerate);
        var canForce = canScreen;

        return new ParticipantCtx(userId, participant.DisplayName, canScreen, canForce);
    }

    private static ScreenShareStateDto Annotate(
        Guid assemblyId,
        ScreenShareStateDto? raw,
        Guid? viewerUserId,
        bool canStart,
        bool canForceStop)
    {
        if (raw is null || !raw.IsActive)
        {
            return new ScreenShareStateDto(
                assemblyId,
                IsActive: false,
                PresenterUserId: null,
                PresenterDisplayName: null,
                StartedAtUtc: null,
                CurrentUserCanStart: canStart,
                CurrentUserIsPresenter: false,
                CurrentUserCanForceStop: canForceStop);
        }

        var isPresenter = viewerUserId is Guid vid && raw.PresenterUserId == vid;
        return raw with
        {
            CurrentUserCanStart = canStart && !raw.IsActive,
            CurrentUserIsPresenter = isPresenter,
            CurrentUserCanForceStop = canForceStop || isPresenter
        };
    }

    private sealed record ParticipantCtx(
        Guid UserId,
        string DisplayName,
        bool CanScreenShare,
        bool CanForceStop);
}
