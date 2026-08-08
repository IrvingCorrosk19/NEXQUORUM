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

    [HttpPost("present")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionDto> Present(
        Guid assemblyId,
        [FromBody] PresentMotionRequest request,
        CancellationToken cancellationToken) =>
        _motions.PresentMotionAsync(assemblyId, request.MotionId, cancellationToken);
}
