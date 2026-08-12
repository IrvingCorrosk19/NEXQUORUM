namespace Asambleas.Web.Controllers;

using Asambleas.Application.Assembly;
using Asambleas.Application.Evidence;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Evidence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies")]
public sealed class AssembliesController : ControllerBase
{
    private readonly AssemblyService _assemblies;
    private readonly AssemblyRoomService _room;
    private readonly AssemblyEvidenceService _evidence;

    public AssembliesController(
        AssemblyService assemblies,
        AssemblyRoomService room,
        AssemblyEvidenceService evidence)
    {
        _assemblies = assemblies;
        _room = room;
        _evidence = evidence;
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
    public Task<AssemblyMinutesDocumentDto> Minutes(Guid assemblyId, CancellationToken cancellationToken) =>
        _room.GetMinutesDocumentAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/minutes/legacy")]
    [Authorize(Policy = Permissions.AssemblyView)]
    public Task<AssemblyMinutesDto> MinutesLegacy(Guid assemblyId, CancellationToken cancellationToken) =>
        _room.GetMinutesAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/evidence")]
    [Authorize(Policy = Permissions.AuditView)]
    public Task<AssemblyEvidencePackageDto> Evidence(Guid assemblyId, CancellationToken cancellationToken) =>
        _room.GetEvidencePackageAsync(assemblyId, cancellationToken);

    [HttpGet("{assemblyId:guid}/evidence/legacy")]
    [Authorize(Policy = Permissions.AuditView)]
    public Task<AssemblyEvidenceDto> EvidenceLegacy(Guid assemblyId, CancellationToken cancellationToken) =>
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

    [HttpPost("{assemblyId:guid}/publish")]
    [Authorize(Policy = Permissions.AssemblySchedule)]
    public Task<AssemblySummaryDto> Publish(Guid assemblyId, CancellationToken cancellationToken) =>
        _assemblies.PublishScheduledAsync(assemblyId, cancellationToken);

    [HttpPost("{assemblyId:guid}/complete")]
    [Authorize(Policy = Permissions.AssemblyClose)]
    public async Task<AssemblySummaryDto> Complete(Guid assemblyId, CancellationToken cancellationToken)
    {
        var summary = await _assemblies.CompleteAsync(assemblyId, cancellationToken);
        await _evidence.SealMinutesAsync(assemblyId, cancellationToken);
        return summary;
    }
}
