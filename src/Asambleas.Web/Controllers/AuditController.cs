namespace Asambleas.Web.Controllers;

using Asambleas.Application.Audit;
using Asambleas.Application.Security;
using Asambleas.Contracts.Audit;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/assemblies/{assemblyId:guid}/audit")]
public sealed class AuditController : ControllerBase
{
    private readonly AuditService _audit;

    public AuditController(AuditService audit)
    {
        _audit = audit;
    }

    [HttpGet]
    [Authorize(Policy = Permissions.AuditView)]
    public Task<AuditEventPageDto> List(
        Guid assemblyId,
        [FromQuery] string? eventType,
        [FromQuery] DateTimeOffset? fromUtc,
        [FromQuery] DateTimeOffset? toUtc,
        [FromQuery] int skip = 0,
        [FromQuery] int take = 50,
        CancellationToken cancellationToken = default) =>
        _audit.QueryAsync(
            new AuditEventQuery(assemblyId, eventType, fromUtc, toUtc, skip, take),
            cancellationToken);
}
