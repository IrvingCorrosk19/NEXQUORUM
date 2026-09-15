namespace Asambleas.Web.Controllers;

using Asambleas.Application.Meeting;
using Asambleas.Application.Security;
using Asambleas.Contracts.Realtime;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/chat")]
public sealed class AssemblyChatController : ControllerBase
{
    private readonly AssemblyChatService _chat;

    public AssemblyChatController(AssemblyChatService chat)
    {
        _chat = chat;
    }

    [HttpGet]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<IReadOnlyList<AssemblyChatMessageDto>> List(
        Guid assemblyId,
        [FromQuery] int take = 100,
        CancellationToken cancellationToken = default) =>
        _chat.ListAsync(assemblyId, take, cancellationToken);

    [HttpPost]
    [Authorize(Policy = Permissions.MeetingJoin)]
    [EnableRateLimiting("auth-login")]
    public Task<AssemblyChatMessageDto> Post(
        Guid assemblyId,
        [FromBody] PostChatMessageRequest request,
        CancellationToken cancellationToken = default) =>
        _chat.PostAsync(assemblyId, request.Body, request.AsAnnouncement, cancellationToken);

    [HttpDelete("{messageId:guid}")]
    [Authorize(Policy = Permissions.MeetingModerate)]
    public async Task<IActionResult> Remove(
        Guid assemblyId,
        Guid messageId,
        CancellationToken cancellationToken = default)
    {
        await _chat.RemoveAsync(assemblyId, messageId, cancellationToken);
        return NoContent();
    }
}

public sealed record PostChatMessageRequest(string Body, bool AsAnnouncement = false);
