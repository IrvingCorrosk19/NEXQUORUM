namespace Asambleas.Web.Controllers;

using Asambleas.Application.Quorum;
using Asambleas.Application.Security;
using Asambleas.Contracts.Quorum;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/quorum")]
public sealed class QuorumController : ControllerBase
{
    private readonly QuorumService _quorum;

    public QuorumController(QuorumService quorum)
    {
        _quorum = quorum;
    }

    /// <summary>Current quorum snapshot (alias of <c>/latest</c> for UI clients).</summary>
    [HttpGet]
    [Authorize(Policy = Permissions.QuorumView)]
    public Task<QuorumDto?> Current(Guid assemblyId, CancellationToken cancellationToken) =>
        _quorum.GetLatestAsync(assemblyId, cancellationToken);

    [HttpGet("latest")]
    [Authorize(Policy = Permissions.QuorumView)]
    public Task<QuorumDto?> Latest(Guid assemblyId, CancellationToken cancellationToken) =>
        _quorum.GetLatestAsync(assemblyId, cancellationToken);

    [HttpGet("snapshots")]
    [Authorize(Policy = Permissions.QuorumView)]
    public Task<IReadOnlyList<QuorumSnapshotDto>> Snapshots(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _quorum.ListSnapshotsAsync(assemblyId, cancellationToken);

    [HttpGet("padron-diagnostic")]
    [Authorize(Policy = Permissions.QuorumView)]
    public Task<CoefficientPadronDiagnosticDto> PadronDiagnostic(
        Guid assemblyId,
        CancellationToken cancellationToken) =>
        _quorum.GetCoefficientPadronDiagnosticAsync(assemblyId, cancellationToken);

    [HttpGet("padron.csv")]
    [Authorize(Policy = Permissions.QuorumView)]
    public async Task<IActionResult> PadronCsv(Guid assemblyId, CancellationToken cancellationToken)
    {
        var csv = await _quorum.ExportCoefficientPadronCsvAsync(assemblyId, cancellationToken);
        return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv", $"padron-{assemblyId:N}.csv");
    }
}
