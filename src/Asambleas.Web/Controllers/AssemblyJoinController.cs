namespace Asambleas.Web.Controllers;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Communications;
using Asambleas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/join")]
public sealed class AssemblyJoinController : ControllerBase
{
    private readonly AssemblyAccessLinkService _links;
    private readonly IAsambleasDbContext _db;

    public AssemblyJoinController(AssemblyAccessLinkService links, IAsambleasDbContext db)
    {
        _links = links;
        _db = db;
    }

    public sealed record JoinPreviewDto(
        bool Valid,
        string? Reason,
        Guid? AssemblyId,
        string? AssemblyTitle,
        string? PropertyHorizontalName,
        string? Status,
        DateTimeOffset? ScheduledAtUtc,
        string? RedirectPath,
        bool RequiresLogin);

    [HttpGet("preview")]
    [AllowAnonymous]
    public async Task<ActionResult<JoinPreviewDto>> Preview([FromQuery] string token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return Ok(new JoinPreviewDto(false, "TOKEN_REQUIRED", null, null, null, null, null, null, false));
        }

        var link = await _links.ResolveValidAsync(token, cancellationToken);
        if (link is null)
        {
            return Ok(new JoinPreviewDto(false, "INVALID_OR_EXPIRED", null, null, null, null, null, null, false));
        }

        var assembly = await _db.Assemblies.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(a => a.Id == link.AssemblyId, cancellationToken);
        var ph = await _db.PropertyHorizontals.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(p => p.Id == link.PropertyHorizontalId, cancellationToken);
        if (assembly is null || ph is null)
        {
            return Ok(new JoinPreviewDto(false, "ASSEMBLY_NOT_FOUND", null, null, null, null, null, null, false));
        }

        var status = assembly.Status.ToString();
        var redirect = assembly.Status is AssemblyStatus.InProgress or AssemblyStatus.Paused or AssemblyStatus.CheckIn
            ? $"/lobby.html?assemblyId={assembly.Id:D}"
            : $"/owner.html?assemblyId={assembly.Id:D}";

        var requiresLogin = !User.Identity?.IsAuthenticated ?? true;
        return Ok(new JoinPreviewDto(
            true,
            null,
            assembly.Id,
            assembly.Title,
            ph.Name,
            status,
            assembly.ScheduledAtUtc,
            redirect,
            requiresLogin));
    }
}
