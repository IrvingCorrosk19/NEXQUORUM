namespace Asambleas.Web.Controllers;

using Asambleas.Application.Security;
using Asambleas.Application.Speaker;
using Asambleas.Contracts.Speakers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/speakers")]
public sealed class SpeakersController : ControllerBase
{
    private readonly SpeakerService _speakers;

    public SpeakersController(SpeakerService speakers)
    {
        _speakers = speakers;
    }

    [HttpPost("request")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<SpeakerRequestDto> RequestFloor(
        Guid assemblyId,
        [FromBody] CreateSpeakerRequest? request,
        CancellationToken cancellationToken) =>
        _speakers.RequestAsync(assemblyId, request ?? new CreateSpeakerRequest(null), cancellationToken);

    /// <summary>Lower own hand — cancels the caller's Requested entry only (idempotent).</summary>
    [HttpPost("cancel")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<SpeakerRequestDto> CancelOwn(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _speakers.CancelOwnAsync(assemblyId, cancellationToken);

    /// <summary>End own Granted floor (idempotent).</summary>
    [HttpPost("complete-own")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public Task<SpeakerRequestDto> CompleteOwn(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _speakers.CompleteOwnAsync(assemblyId, cancellationToken);

    [HttpPost("{speakerRequestId:guid}/grant")]
    [Authorize(Policy = Permissions.MeetingModerate)]
    public Task<SpeakerRequestDto> Grant(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken) =>
        _speakers.GrantAsync(assemblyId, speakerRequestId, cancellationToken);

    [HttpPost("{speakerRequestId:guid}/complete")]
    [Authorize(Policy = Permissions.MeetingModerate)]
    public Task<SpeakerRequestDto> Complete(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken) =>
        _speakers.CompleteAsync(assemblyId, speakerRequestId, cancellationToken);

    [HttpPost("{speakerRequestId:guid}/reject")]
    [Authorize(Policy = Permissions.MeetingModerate)]
    public Task<SpeakerRequestDto> Reject(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken) =>
        _speakers.RejectAsync(assemblyId, speakerRequestId, cancellationToken);

    [HttpPost("{speakerRequestId:guid}/skip")]
    [Authorize(Policy = Permissions.MeetingModerate)]
    public Task<SpeakerRequestDto> Skip(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken) =>
        _speakers.SkipAsync(assemblyId, speakerRequestId, cancellationToken);

    [HttpGet("queue")]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<SpeakerQueueDto> Queue(Guid assemblyId, CancellationToken cancellationToken) =>
        _speakers.GetQueueAsync(assemblyId, cancellationToken);
}
