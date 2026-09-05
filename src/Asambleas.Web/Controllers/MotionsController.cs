namespace Asambleas.Web.Controllers;

using Asambleas.Application.Motion;
using Asambleas.Application.Security;
using Asambleas.Contracts.Motions;
using Asambleas.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/motions")]
public sealed class MotionsController : ControllerBase
{
    private readonly MotionService _motions;
    private readonly MotionImportService _import;

    public MotionsController(MotionService motions, MotionImportService import)
    {
        _motions = motions;
        _import = import;
    }

    [HttpGet]
    [Authorize(Policy = Permissions.MotionView)]
    public Task<IReadOnlyList<MotionDto>> List(Guid assemblyId, CancellationToken cancellationToken) =>
        _motions.ListAsync(assemblyId, cancellationToken);

    [HttpGet("active")]
    [Authorize(Policy = Permissions.MotionView)]
    public Task<MotionDto?> Active(Guid assemblyId, CancellationToken cancellationToken) =>
        _motions.GetActiveAsync(assemblyId, cancellationToken);

    [HttpGet("import/catalogs")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionImportCatalogsDto> ImportCatalogs(Guid assemblyId, CancellationToken cancellationToken) =>
        _import.GetCatalogsAsync(assemblyId, cancellationToken);

    [HttpGet("import/template")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public async Task<IActionResult> ImportTemplate(Guid assemblyId, CancellationToken cancellationToken)
    {
        var (bytes, fileName) = await _import.BuildTemplateAsync(assemblyId, cancellationToken);
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
    }

    [HttpPost("import/analyze")]
    [Authorize(Policy = Permissions.MotionCreate)]
    [RequestSizeLimit(MotionImportService.MaxFileBytes)]
    public async Task<MotionImportPreviewDto> ImportAnalyze(
        Guid assemblyId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            throw new DomainException("IMPORT_FILE_EMPTY", "Seleccione un archivo .xlsx o .csv.");
        }

        await using var stream = file.OpenReadStream();
        var name = file.FileName ?? string.Empty;
        var ext = Path.GetExtension(name).ToLowerInvariant();
        return ext switch
        {
            ".xlsx" => await _import.AnalyzeXlsxAsync(assemblyId, stream, name, cancellationToken),
            ".csv" => await _import.AnalyzeCsvAsync(assemblyId, stream, name, cancellationToken),
            _ => throw new DomainException("IMPORT_BAD_TYPE", "Solo se admiten archivos .xlsx o .csv.")
        };
    }

    [HttpPost("import/patch-row")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionImportPreviewDto> ImportPatchRow(
        Guid assemblyId,
        [FromBody] MotionImportRowPatchRequest request,
        CancellationToken cancellationToken) =>
        _import.PatchRowAsync(assemblyId, request, cancellationToken);

    [HttpPost("import/commit")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<MotionImportCommitResultDto> ImportCommit(
        Guid assemblyId,
        [FromBody] MotionImportCommitRequest request,
        CancellationToken cancellationToken) =>
        _import.CommitAsync(assemblyId, request, cancellationToken);

    [HttpPost("bulk-publish")]
    [Authorize(Policy = Permissions.MotionCreate)]
    public Task<BulkPublishMotionsResultDto> BulkPublish(
        Guid assemblyId,
        [FromBody] BulkPublishMotionsRequest request,
        CancellationToken cancellationToken) =>
        _import.BulkPublishAsync(assemblyId, request, cancellationToken);

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