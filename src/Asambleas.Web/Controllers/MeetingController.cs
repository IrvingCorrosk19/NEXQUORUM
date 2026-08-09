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
}
