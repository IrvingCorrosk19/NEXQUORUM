namespace Asambleas.Web.Controllers;

using Asambleas.Application.Assembly;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies")]
public sealed class AssembliesController : ControllerBase
{
    private readonly AssemblyService _assemblies;
    private readonly AssemblyRoomService _room;

    public AssembliesController(AssemblyService assemblies, AssemblyRoomService room)
    {
        _assemblies = assemblies;
        _room = room;
    }

    [HttpGet]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<IReadOnlyList<AssemblySummaryDto>> List(CancellationToken cancellationToken) =>
        _assemblies.ListForCurrentUserAsync(cancellationToken);

    [HttpGet("{assemblyId:guid}")]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<AssemblyDetailDto> Get(Guid assemblyId, CancellationToken cancellationToken) =>
        _assemblies.GetAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/dashboard")]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<AssemblyDashboardDto> Dashboard(Guid assemblyId, CancellationToken cancellationToken) =>
        _room.GetDashboardAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/room-state")]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<AssemblyRoomStateDto> RoomState(Guid assemblyId, CancellationToken cancellationToken) =>
        _room.GetRoomStateAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/readiness")]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<AssemblyReadinessDto> Readiness(Guid assemblyId, CancellationToken cancellationToken) =>
        _room.GetReadinessAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/minutes")]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<AssemblyMinutesDto> Minutes(Guid assemblyId, CancellationToken cancellationToken) =>
        _room.GetMinutesAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/evidence")]
    [Authorize(Policy = Permissions.AuditView)]
    public Task<AssemblyEvidenceDto> Evidence(Guid assemblyId, CancellationToken cancellationToken) =>
        _room.GetEvidenceAsync(assemblyId, cancellationToken);

    [HttpPost("{assemblyId:guid}/start-checkin")]
    [Authorize(Policy = Permissions.AssemblyStart)]
    public Task<AssemblySummaryDto> StartCheckIn(Guid assemblyId, CancellationToken cancellationToken) =>
        _assemblies.StartCheckInAsync(assemblyId, cancellationToken);

    [HttpPost("{assemblyId:guid}/start")]
    [Authorize(Policy = Permissions.AssemblyStart)]
    public Task<AssemblySummaryDto> Start(Guid assemblyId, CancellationToken cancellationToken) =>
        _assemblies.StartAsync(assemblyId, cancellationToken);

    [HttpPost("{assemblyId:guid}/pause")]
    [Authorize(Policy = Permissions.AssemblyManage)]
    public Task<AssemblySummaryDto> Pause(Guid assemblyId, CancellationToken cancellationToken) =>
        _assemblies.PauseAsync(assemblyId, cancellationToken);

    [HttpPost("{assemblyId:guid}/resume")]
    [Authorize(Policy = Permissions.AssemblyManage)]
    public Task<AssemblySummaryDto> Resume(Guid assemblyId, CancellationToken cancellationToken) =>
        _assemblies.ResumeAsync(assemblyId, cancellationToken);

    [HttpPost("{assemblyId:guid}/complete")]
    [Authorize(Policy = Permissions.AssemblyClose)]
    public Task<AssemblySummaryDto> Complete(Guid assemblyId, CancellationToken cancellationToken) =>
        _assemblies.CompleteAsync(assemblyId, cancellationToken);
}
