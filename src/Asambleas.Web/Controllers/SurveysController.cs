namespace Asambleas.Web.Controllers;

using Asambleas.Application.Security;
using Asambleas.Application.Surveys;
using Asambleas.Contracts.Surveys;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/surveys")]
public sealed class SurveysController : ControllerBase
{
    private readonly SurveyFormService _surveys;

    public SurveysController(SurveyFormService surveys)
    {
        _surveys = surveys;
    }

    [HttpGet]
    [Authorize(Policy = Permissions.MotionView)]
    public Task<IReadOnlyList<SurveyFormDto>> List(Guid assemblyId, CancellationToken cancellationToken) =>
        _surveys.ListAsync(assemblyId, cancellationToken);

    [HttpGet("{formId:guid}")]
    [Authorize(Policy = Permissions.MotionView)]
    public Task<SurveyFormDto> Get(Guid assemblyId, Guid formId, CancellationToken cancellationToken) =>
        _surveys.GetAsync(assemblyId, formId, cancellationToken);

    [HttpPost]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<SurveyFormDto> Create(
        Guid assemblyId,
        [FromBody] CreateSurveyFormRequest request,
        CancellationToken cancellationToken) =>
        _surveys.CreateAsync(assemblyId, request, cancellationToken);

    [HttpPut("{formId:guid}")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<SurveyFormDto> Update(
        Guid assemblyId,
        Guid formId,
        [FromBody] UpdateSurveyFormRequest request,
        CancellationToken cancellationToken) =>
        _surveys.UpdateAsync(assemblyId, formId, request, cancellationToken);

    [HttpPost("{formId:guid}/publish")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<SurveyFormDto> Publish(Guid assemblyId, Guid formId, CancellationToken cancellationToken) =>
        _surveys.PublishAsync(assemblyId, formId, cancellationToken);

    [HttpPost("{formId:guid}/close")]
    [Authorize(Policy = Permissions.VoteClose)]
    public Task<SurveyFormDto> Close(Guid assemblyId, Guid formId, CancellationToken cancellationToken) =>
        _surveys.CloseAsync(assemblyId, formId, cancellationToken);

    [HttpPost("{formId:guid}/responses")]
    [Authorize(Policy = Permissions.VoteCast)]
    public Task<SurveyResponseDto> Submit(
        Guid assemblyId,
        Guid formId,
        [FromBody] SubmitSurveyResponseRequest request,
        CancellationToken cancellationToken) =>
        _surveys.SubmitAsync(assemblyId, formId, request, cancellationToken);

    [HttpGet("{formId:guid}/results")]
    [Authorize(Policy = Permissions.VoteResults)]
    public Task<SurveyResultsDto> Results(Guid assemblyId, Guid formId, CancellationToken cancellationToken) =>
        _surveys.GetResultsAsync(assemblyId, formId, cancellationToken);
}
