namespace Asambleas.Web.Controllers;

using System.Security.Claims;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Attendance;
using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Identity;
using Asambleas.Infrastructure.Seed;
using Asambleas.Infrastructure.Tenancy;
using Asambleas.Web.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/join")]
public sealed class AssemblyJoinController : ControllerBase
{
    private readonly AssemblyAccessLinkService _links;
    private readonly IAsambleasDbContext _db;
    private readonly IOwnerPortalIdentityService _identity;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly AttendanceService _attendance;
    private readonly ICurrentTenant _currentTenant;
    private readonly IVerifiedJoinProofService _verifiedJoinProofs;
    private readonly ILogger<AssemblyJoinController> _logger;

    public AssemblyJoinController(
        AssemblyAccessLinkService links,
        IAsambleasDbContext db,
        IOwnerPortalIdentityService identity,
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        AttendanceService attendance,
        ICurrentTenant currentTenant,
        IVerifiedJoinProofService verifiedJoinProofs,
        ILogger<AssemblyJoinController> logger)
    {
        _links = links;
        _db = db;
        _identity = identity;
        _userManager = userManager;
        _signInManager = signInManager;
        _attendance = attendance;
        _currentTenant = currentTenant;
        _verifiedJoinProofs = verifiedJoinProofs;
        _logger = logger;
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

    public sealed record JoinClaimRequest(string Token);

    public sealed record JoinClaimDto(Guid AssemblyId, string RedirectPath);

    public sealed record JoinRedeemRequest(string Token);

    public sealed record JoinRequestResendRequest(string? Token, string? Email);

    [HttpGet("preview")]
    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    public async Task<ActionResult<JoinPreviewDto>> Preview([FromQuery] string token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return Ok(new JoinPreviewDto(false, "TOKEN_REQUIRED", null, null, null, null, null, null, false));
        }

        // Peek — do not bump LastUsed (email scanners / preview must not consume).
        var link = await _links.PeekValidAsync(token, cancellationToken);
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

        if (assembly.Status is AssemblyStatus.Cancelled)
        {
            return Ok(new JoinPreviewDto(
                false,
                "CANCELLED",
                assembly.Id,
                assembly.Title,
                ph.Name,
                assembly.Status.ToString(),
                assembly.ScheduledAtUtc,
                null,
                RequiresLogin: false));
        }

        if (assembly.Status is AssemblyStatus.Completed)
        {
            return Ok(new JoinPreviewDto(
                false,
                "COMPLETED",
                assembly.Id,
                assembly.Title,
                ph.Name,
                assembly.Status.ToString(),
                assembly.ScheduledAtUtc,
                $"/dashboard.html?assemblyId={assembly.Id:D}&mode=historical",
                RequiresLogin: false));
        }

        var redirect = ResolveRedirect(assembly.Status, assembly.Id);
        // Passwordless redeem — no login form on the happy path.
        return Ok(new JoinPreviewDto(
            true,
            null,
            assembly.Id,
            assembly.Title,
            ph.Name,
            assembly.Status.ToString(),
            assembly.ScheduledAtUtc,
            redirect,
            RequiresLogin: false));
    }

    /// <summary>
    /// Passwordless redeem: validates token, ensures Owner identity, signs cookie, enrolls participant.
    /// </summary>
    [HttpPost("redeem")]
    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    public async Task<ActionResult<JoinClaimDto>> Redeem(
        [FromBody] JoinRedeemRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            return BadRequest(new { message = "Este enlace ya no está disponible. Solicita uno nuevo para ingresar." });
        }

        var link = await _links.PeekValidAsync(request.Token, cancellationToken);
        if (link is null)
        {
            _logger.LogInformation("Join redeem rejected (invalid/expired) hashPrefix={Prefix}",
                HashPrefix(request.Token));
            return BadRequest(new { message = "Este enlace ya no está disponible. Solicita uno nuevo para ingresar.", code = "INVALID_OR_EXPIRED" });
        }

        var recipient = await _db.ConvocationRecipients.IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.Id == link.RecipientId, cancellationToken);
        if (recipient is null || string.IsNullOrWhiteSpace(recipient.Email))
        {
            return BadRequest(new { message = "Este enlace ya no está disponible. Solicita uno nuevo para ingresar." });
        }

        var assembly = await _db.Assemblies.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == link.AssemblyId, cancellationToken);
        if (assembly is null)
        {
            return BadRequest(new { message = "Este enlace ya no está disponible. Solicita uno nuevo para ingresar." });
        }

        if (assembly.Status is AssemblyStatus.Cancelled)
        {
            return BadRequest(new
            {
                message = "Esta asamblea fue cancelada. No es necesario que ingreses.",
                code = "CANCELLED"
            });
        }

        if (assembly.Status is AssemblyStatus.Completed)
        {
            return BadRequest(new
            {
                message = "Esta asamblea ya finalizó.",
                code = "COMPLETED"
            });
        }

        var ph = await _db.PropertyHorizontals.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == link.PropertyHorizontalId, cancellationToken);

        var displayName = string.IsNullOrWhiteSpace(recipient.DisplayName)
            ? recipient.Email.Split('@')[0]
            : recipient.DisplayName;

        var userId = await _identity.EnsureOwnerUserPasswordlessAsync(
            link.TenantId,
            ph?.OrganizationId,
            recipient.Email,
            displayName,
            cancellationToken);

        var user = await _userManager.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "No pudimos preparar tu acceso. Solicita un nuevo enlace." });
        }

        var roles = await ResolveEffectiveRolesAsync(user, cancellationToken);
        var permissions = RolePermissionMap.GetPermissions(roles).ToList();
        // Magic-link session must never elevate to open/close voting or PH admin.
        permissions = permissions
            .Where(p => p is not (
                Permissions.VoteOpen or Permissions.VoteClose
                or Permissions.AssemblyStart or Permissions.AssemblyClose
                or Permissions.AssemblyManage or Permissions.PhManage
                or Permissions.OwnerManage or Permissions.UnitManage))
            .ToList();

        var existingClaims = await _userManager.GetClaimsAsync(user);
        var extra = BuildOwnerSessionClaims(user, link.PropertyHorizontalId, roles, permissions, existingClaims);

        await _signInManager.SignOutAsync();
        await _signInManager.SignInWithClaimsAsync(user, isPersistent: false, extra);

        var (assemblyId, redirect) = await _links.ClaimAsync(request.Token, userId, recipient.Email, cancellationToken);
        await _links.MarkRedeemedAsync(link.Id, cancellationToken);

        // Server-scoped redeem proof (not sessionStorage). Single-use at check-in; never auto-accredits.
        _verifiedJoinProofs.Issue(
            link.TenantId,
            link.PropertyHorizontalId,
            assemblyId,
            userId,
            link.Id);

        _logger.LogInformation(
            "Join redeem ok linkId={LinkId} assemblyId={AssemblyId} userId={UserId} (no auto-accredit; verified-join proof issued)",
            link.Id, assemblyId, userId);

        return Ok(new JoinClaimDto(assemblyId, redirect));
    }

    [HttpPost("claim")]
    [Authorize]
    [EnableRateLimiting("auth-login")]
    public async Task<ActionResult<JoinClaimDto>> Claim(
        [FromBody] JoinClaimRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            return BadRequest(new { message = "Este enlace ya no está disponible. Solicita uno nuevo para ingresar." });
        }

        var userIdRaw = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdRaw, out var userId) || userId == Guid.Empty)
        {
            return Unauthorized();
        }

        var email = await _identity.GetEmailByUserIdAsync(userId, cancellationToken)
                    ?? User.FindFirstValue(ClaimTypes.Email)
                    ?? User.Identity?.Name;

        try
        {
            var peek = await _links.PeekValidAsync(request.Token, cancellationToken);
            var (assemblyId, redirect) = await _links.ClaimAsync(request.Token, userId, email, cancellationToken);
            if (peek is not null)
            {
                _verifiedJoinProofs.Issue(
                    peek.TenantId,
                    peek.PropertyHorizontalId,
                    assemblyId,
                    userId,
                    peek.Id);
            }

            return Ok(new JoinClaimDto(assemblyId, redirect));
        }
        catch (DomainException ex) when (ex.Code is "INVALID_OR_EXPIRED" or "AUTH_REQUIRED" or "JOIN_EMAIL_MISMATCH")
        {
            return BadRequest(new { message = "Este enlace ya no está disponible. Solicita uno nuevo para ingresar.", code = ex.Code });
        }
    }

    /// <summary>
    /// Soft resend: if we can resolve the recipient from a prior token or email, issue a fresh link via the open convocation.
    /// Always returns a generic success message (no account enumeration).
    /// </summary>
    [HttpPost("request-resend")]
    [AllowAnonymous]
    [EnableRateLimiting("auth-login")]
    public async Task<IActionResult> RequestResend(
        [FromBody] JoinRequestResendRequest request,
        CancellationToken cancellationToken)
    {
        const string okMsg = "Si el correo corresponde a una convocatoria activa, enviaremos un nuevo enlace en breve.";

        try
        {
            string? email = request.Email?.Trim();
            Guid? convocationId = null;
            Guid? recipientId = null;

            if (!string.IsNullOrWhiteSpace(request.Token))
            {
                var hash = AssemblyAccessLinkService.HashToken(request.Token.Trim());
                var anyLink = await _db.AssemblyAccessLinks.IgnoreQueryFilters()
                    .OrderByDescending(l => l.CreatedAtUtc)
                    .FirstOrDefaultAsync(l => l.TokenHash == hash, cancellationToken);
                if (anyLink is not null)
                {
                    convocationId = anyLink.ConvocationId;
                    recipientId = anyLink.RecipientId;
                    var recipient = await _db.ConvocationRecipients.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(r => r.Id == anyLink.RecipientId, cancellationToken);
                    email ??= recipient?.Email;
                }
            }

            if (string.IsNullOrWhiteSpace(email))
            {
                return Ok(new { message = okMsg });
            }

            // Prefer open Sent convocations for this recipient email.
            var deliveryTarget = await (
                from r in _db.ConvocationRecipients.IgnoreQueryFilters()
                join c in _db.Convocations.IgnoreQueryFilters() on r.ConvocationId equals c.Id
                where r.Email.ToLower() == email.ToLower()
                      && c.Status == ConvocationStatus.Sent
                orderby c.SentAtUtc descending, c.CreatedAtUtc descending
                select new { Recipient = r, Convocation = c }
            ).FirstOrDefaultAsync(cancellationToken);

            if (deliveryTarget is null)
            {
                return Ok(new { message = okMsg });
            }

            // Soft-touch: mark that a resend was requested (admin evidence). Actual email send reuses existing resend pipeline when available.
            _logger.LogInformation(
                "Join resend requested for convocation {ConvocationId} recipient {RecipientId}",
                deliveryTarget.Convocation.Id,
                deliveryTarget.Recipient.Id);

            // Issue a fresh access link URL is created on next admin resend; for self-serve we issue now and rely on SMTP if configured.
            // Without injecting dispatch here, we still create a new link the admin can see / next send uses.
            var assembly = await _db.Assemblies.IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == deliveryTarget.Convocation.AssemblyId, cancellationToken);

            await _links.IssueAsync(
                deliveryTarget.Convocation,
                deliveryTarget.Recipient,
                deliveryId: null,
                assembly?.ScheduledAtUtc,
                assembly?.EstimatedEndAtUtc,
                AccessLinkRevocationReasons.Resent,
                cancellationToken);

            return Ok(new { message = okMsg });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Join resend request failed (soft)");
            return Ok(new { message = okMsg });
        }
    }

    private void BindTenantContext(
        Guid tenantId,
        Guid propertyHorizontalId,
        Guid userId,
        string displayName,
        IReadOnlyList<string> roles,
        IReadOnlyList<string> permissions)
    {
        if (_currentTenant is not CurrentTenant live)
        {
            return;
        }

        live.TenantId = tenantId;
        live.PropertyHorizontalId = propertyHorizontalId;
        live.UserId = userId;
        live.IsAuthenticated = true;
        live.DisplayName = displayName;
        live.Roles = roles.ToList();
        live.Permissions = permissions.ToList();
    }

    private async Task<List<string>> ResolveEffectiveRolesAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        var roles = (await _userManager.GetRolesAsync(user)).ToList();
        if (roles.Count == 0 && !string.IsNullOrWhiteSpace(user.DemoRole))
        {
            roles.Add(user.DemoRole);
        }

        // Ownership composition: chair who is also an owner keeps vote:cast via Owner role union.
        var isLinkedOwner = await _db.Owners.IgnoreQueryFilters()
            .AnyAsync(
                o => o.UserId == user.Id
                     && o.Status != OwnerLifecycleStatus.Inactive,
                cancellationToken);
        if (isLinkedOwner && !roles.Contains(Roles.Owner, StringComparer.OrdinalIgnoreCase))
        {
            roles.Add(Roles.Owner);
            await _identity.LinkOwnerRoleAsync(user.Id, cancellationToken);
        }

        return roles.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static List<Claim> BuildOwnerSessionClaims(
        ApplicationUser user,
        Guid propertyHorizontalId,
        IReadOnlyList<string> roles,
        IReadOnlyCollection<string> permissions,
        IList<Claim> existingClaims)
    {
        var claims = new List<Claim>
        {
            new(AsambleasClaimTypes.TenantId, user.TenantId.ToString("D")),
            new(AsambleasClaimTypes.DisplayName, user.DisplayName),
            new(AsambleasClaimTypes.PropertyHorizontalId, propertyHorizontalId.ToString("D"))
        };

        if (user.OrganizationId is Guid orgId)
        {
            claims.Add(new Claim(AsambleasClaimTypes.OrganizationId, orgId.ToString("D")));
        }

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        foreach (var permission in permissions)
        {
            claims.Add(new Claim(AsambleasClaimTypes.Permission, permission));
        }

        return claims;
    }

    private static string ResolveRedirect(AssemblyStatus status, Guid assemblyId) =>
        AssemblyAccessLinkService.ResolveParticipantRoomRedirect(status, assemblyId);

    private static string HashPrefix(string raw)
    {
        try
        {
            var hash = AssemblyAccessLinkService.HashToken(raw);
            return hash.Length <= 8 ? hash : hash[..8];
        }
        catch
        {
            return "n/a";
        }
    }
}
