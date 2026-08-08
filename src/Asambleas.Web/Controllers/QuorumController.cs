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
}
