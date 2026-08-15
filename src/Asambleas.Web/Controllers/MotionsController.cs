namespace Asambleas.Web.Controllers;

using Asambleas.Application.Motion;
using Asambleas.Application.Security;
using Asambleas.Contracts.Motions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/motions")]
public sealed class MotionsController : ControllerBase
{
    private readonly MotionService _motions;

    public MotionsController(MotionService motions)
    {
        _motions = motions;
    }

    [HttpGet]
    [Authorize(Policy = Permissions.MotionView)]
    public Task<IReadOnlyList<MotionDto>> List(Guid assemblyId, CancellationToken cancellationToken) =>
        _motions.ListAsync(assemblyId, cancellationToken);

    [HttpGet("active")]
    [Authorize(Policy = Permissions.MotionView)]
    public Task<MotionDto?> Active(Guid assemblyId, CancellationToken cancellationToken) =>
        _motions.GetActiveAsync(assemblyId, cancellationToken);

    [HttpGet("{motionId:guid}")]
    [Authorize(Policy = Permissions.MotionView)]
    public Task<MotionDto> Get(Guid assemblyId, Guid motionId, CancellationToken cancellationToken) =>
        _motions.GetByIdAsync(assemblyId, motionId, cancellationToken);

    [HttpPost]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionDto> Create(
        Guid assemblyId,
        [FromBody] CreateMotionRequest request,
        CancellationToken cancellationToken) =>
        _motions.CreateAsync(assemblyId, request, cancellationToken);

    [HttpPut("{motionId:guid}")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionDto> Update(
        Guid assemblyId,
        Guid motionId,
        [FromBody] UpdateMotionRequest request,
        CancellationToken cancellationToken) =>
        _motions.UpdateAsync(assemblyId, motionId, request, cancellationToken);

    [HttpPost("{motionId:guid}/publish")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionDto> Publish(Guid assemblyId, Guid motionId, CancellationToken cancellationToken) =>
        _motions.PublishAsync(assemblyId, motionId, cancellationToken);

    [HttpPost("{motionId:guid}/duplicate")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionDto> Duplicate(Guid assemblyId, Guid motionId, CancellationToken cancellationToken) =>
        _motions.DuplicateAsync(assemblyId, motionId, cancellationToken);

    [HttpPost("{motionId:guid}/archive")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionDto> Archive(Guid assemblyId, Guid motionId, CancellationToken cancellationToken) =>
        _motions.ArchiveAsync(assemblyId, motionId, cancellationToken);

    [HttpGet("{motionId:guid}/edit-policy")]
    [Authorize(Policy = Permissions.MotionView)]
    public Task<MotionEditPolicyDto> EditPolicy(Guid assemblyId, Guid motionId, CancellationToken cancellationToken) =>
        _motions.GetEditPolicyAsync(assemblyId, motionId, cancellationToken);

    [HttpPost("{motionId:guid}/versions")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionDto> CreateVersion(
        Guid assemblyId,
        Guid motionId,
        [FromBody] CreateMotionVersionRequest? request,
        CancellationToken cancellationToken) =>
        _motions.CreateVersionAsync(assemblyId, motionId, request, cancellationToken);

    [HttpPost("present")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionDto> Present(
        Guid assemblyId,
        [FromBody] PresentMotionRequest request,
        CancellationToken cancellationToken) =>
        _motions.PresentMotionAsync(assemblyId, request.MotionId, cancellationToken);

    [HttpPost("reorder")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<IReadOnlyList<MotionDto>> Reorder(
        Guid assemblyId,
        [FromBody] ReorderMotionsRequest request,
        CancellationToken cancellationToken) =>
        _motions.ReorderAsync(assemblyId, request, cancellationToken);
}
