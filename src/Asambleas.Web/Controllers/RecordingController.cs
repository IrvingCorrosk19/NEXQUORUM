namespace Asambleas.Web.Controllers;

using Asambleas.Application.Evidence;
using Asambleas.Application.Recording;
using Asambleas.Application.Security;
using Asambleas.Contracts.Recordings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}")]
public sealed class RecordingController : ControllerBase
{
    private readonly RecordingService _recordings;
    private readonly EvidencePackageExportService _export;

    public RecordingController(RecordingService recordings, EvidencePackageExportService export)
    {
        _recordings = recordings;
        _export = export;
    }

    [HttpGet("recording/policy")]
    [Authorize(Policy = Permissions.RecordingView)]
    public Task<RecordingPolicyDto> Policy(Guid assemblyId, CancellationToken cancellationToken) =>
        _recordings.GetPolicyDtoAsync(assemblyId, cancellationToken);

    [HttpPost("recording/notice/ack")]
    [Authorize(Policy = Permissions.MeetingJoin)]
    public async Task<IActionResult> AcknowledgeNotice(
        Guid assemblyId,
        [FromBody] AcknowledgeRecordingNoticeRequest? request,
        CancellationToken cancellationToken)
    {
        var ua = Request.Headers.UserAgent.ToString();
        await _recordings.AcknowledgeNoticeAsync(
            assemblyId,
            request?.NoticeVersion,
            ua,
            cancellationToken);
        return NoContent();
    }

    [HttpPost("recording/start")]
    [Authorize(Policy = Permissions.RecordingControl)]
    public Task<AssemblyRecordingDto> Start(Guid assemblyId, CancellationToken cancellationToken) =>
        _recordings.StartRecordingAsync(assemblyId, cancellationToken);

    [HttpPost("recording/{recordingId:guid}/stop")]
    [Authorize(Policy = Permissions.RecordingControl)]
    public Task<AssemblyRecordingDto> Stop(
        Guid assemblyId,
        Guid recordingId,
        CancellationToken cancellationToken) =>
        _recordings.StopRecordingAsync(assemblyId, recordingId, cancellationToken);

    [HttpPost("recording/{recordingId:guid}/refresh")]
    [Authorize(Policy = Permissions.RecordingView)]
    public Task<AssemblyRecordingDto> Refresh(
        Guid assemblyId,
        Guid recordingId,
        CancellationToken cancellationToken) =>
        _recordings.RefreshStatusAsync(assemblyId, recordingId, cancellationToken);

    [HttpGet("recordings")]
    [Authorize(Policy = Permissions.RecordingView)]
    public Task<IReadOnlyList<AssemblyRecordingDto>> List(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _recordings.ListRecordingsAsync(assemblyId, cancellationToken);

    [HttpGet("expediente")]
    [Authorize(Policy = Permissions.ExpedienteView)]
    public Task<SessionExpedienteDto> Expediente(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _recordings.GetExpedienteAsync(assemblyId, cancellationToken);

    [HttpGet("expediente/package")]
    [Authorize(Policy = Permissions.ExpedienteDownload)]
    public async Task<IActionResult> DownloadPackage(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        var (stream, fileName) = await _export.BuildZipAsync(assemblyId, cancellationToken);
        return File(stream, "application/zip", fileName);
    }

    [HttpGet("recording/{recordingId:guid}/play")]
    [Authorize(Policy = Permissions.RecordingView)]
    public Task<IActionResult> Play(
        Guid assemblyId,
        Guid recordingId,
        CancellationToken cancellationToken) =>
        StreamRecordingAsync(assemblyId, recordingId, download: false, cancellationToken);

    [HttpGet("recording/{recordingId:guid}/download")]
    [Authorize(Policy = Permissions.RecordingDownload)]
    public Task<IActionResult> Download(
        Guid assemblyId,
        Guid recordingId,
        CancellationToken cancellationToken) =>
        StreamRecordingAsync(assemblyId, recordingId, download: true, cancellationToken);

    private async Task<IActionResult> StreamRecordingAsync(
        Guid assemblyId,
        Guid recordingId,
        bool download,
        CancellationToken cancellationToken)
    {
        _ = assemblyId;
        var (stream, length, contentType, fileName) =
            await _recordings.OpenRecordingStreamAsync(recordingId, download, cancellationToken);

        Response.Headers.AcceptRanges = "bytes";
        _ = length;
        if (download)
        {
            return File(stream, contentType, fileName, enableRangeProcessing: true);
        }

        return File(stream, contentType, enableRangeProcessing: true);
    }
}

[ApiController]
[Authorize]
[Route("api/admin/recordings")]
public sealed class RecordingAdminController : ControllerBase
{
    private readonly RecordingService _recordings;

    public RecordingAdminController(RecordingService recordings)
    {
        _recordings = recordings;
    }

    [HttpGet("stats")]
    [Authorize(Policy = Permissions.AuditView)]
    public Task<RecordingStorageStatsDto> Stats(CancellationToken cancellationToken) =>
        _recordings.GetStorageStatsAsync(cancellationToken);
}
