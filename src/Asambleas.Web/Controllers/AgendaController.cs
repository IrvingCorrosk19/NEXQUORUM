namespace Asambleas.Web.Controllers;

using Asambleas.Application.Agenda;
using Asambleas.Application.Security;
using Asambleas.Contracts.Agenda;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/agenda")]
public sealed class AgendaController : ControllerBase
{
    private readonly AgendaService _agenda;

    public AgendaController(AgendaService agenda)
    {
        _agenda = agenda;
    }

    [HttpGet]
    [Authorize(Policy = Permissions.AgendaView)]
    public Task<AgendaListResponse> List(Guid assemblyId, CancellationToken cancellationToken) =>
        _agenda.GetItemsAsync(assemblyId, cancellationToken);

    [HttpPost]
    [Authorize(Policy = Permissions.AgendaManage)]
    public Task<AgendaListResponse> Create(
        Guid assemblyId,
        [FromBody] CreateAgendaItemRequest request,
        CancellationToken cancellationToken) =>
        _agenda.CreateItemAsync(assemblyId, request, cancellationToken);

    [HttpPost("active")]
    [Authorize(Policy = Permissions.AgendaManage)]
    public Task<AgendaListResponse> SetActive(
        Guid assemblyId,
        [FromBody] ActivateAgendaItemRequest request,
        CancellationToken cancellationToken) =>
        _agenda.SetActiveItemAsync(assemblyId, request.AgendaItemId, cancellationToken);
}
