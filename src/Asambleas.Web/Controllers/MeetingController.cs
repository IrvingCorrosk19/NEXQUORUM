namespace Asambleas.Web.Controllers;

using Asambleas.Application.Meeting;
using Asambleas.Application.Security;
using Asambleas.Contracts.Meetings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/meeting")]
public sealed class MeetingController : ControllerBase
{
    private readonly MeetingService _meetings;
    private readonly DeviceActivationRequestService _deviceRequests;

    public MeetingController(MeetingService meetings, DeviceActivationRequestService deviceRequests)
    {
        _meetings = meetings;
        _deviceRequests = deviceRequests;
    }

    /// <summary>Mints a short-lived join token. Publish capability is server-derived (never from client).</summary>
    [HttpPost("join-token")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<MeetingJoinTokenResponse> JoinToken(
        Guid assemblyId,
        CancellationToken cancellationToken = default) =>
        _meetings.GetJoinInfoAsync(assemblyId, cancellationToken);

    [HttpGet("room")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<MeetingRoomInfoDto> Room(Guid assemblyId, CancellationToken cancellationToken) =>
        _meetings.GetRoomInfoAsync(assemblyId, cancellationToken);

    [HttpGet("screen-share")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<ScreenShareStateDto> ScreenShare(
        Guid assemblyId,
        CancellationToken cancellationToken = default) =>
        _meetings.GetScreenShareStateAsync(assemblyId, cancellationToken);

    [HttpPost("screen-share/start")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<StartScreenShareResponse> StartScreenShare(
        Guid assemblyId,
        CancellationToken cancellationToken = default) =>
        _meetings.StartScreenShareAsync(assemblyId, cancellationToken);

    [HttpPost("screen-share/stop")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<StopScreenShareResponse> StopScreenShare(
        Guid assemblyId,
        [FromQuery] bool force = false,
        CancellationToken cancellationToken = default) =>
        _meetings.StopScreenShareAsync(assemblyId, force, cancellationToken);

    /// <summary>
    /// Request that a participant enable mic/camera. Does not force the device on.
    /// Omit targetUserId to request all present participants (except self).
    /// </summary>
    [HttpPost("request-device")]
    [Authorize(Policy = Permissions.MeetingModerate)]
    public async Task<IActionResult> RequestDevice(
        Guid assemblyId,
        [FromBody] RequestDeviceActivationBody body,
        CancellationToken cancellationToken = default)
    {
        await _deviceRequests.RequestAsync(assemblyId, body.TargetUserId, body.Device, cancellationToken);
        return Accepted();
    }
}

public sealed record RequestDeviceActivationBody(string Device, Guid? TargetUserId = null);
