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

    public MeetingController(MeetingService meetings)
    {
        _meetings = meetings;
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
}
