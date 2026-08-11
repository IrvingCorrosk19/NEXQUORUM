namespace Asambleas.Web.Controllers;

using System.Security.Claims;
using Asambleas.Application.Abstractions;
using Asambleas.Application.PhOnboarding;
using Asambleas.Application.Security;
using Asambleas.Contracts.PhOnboarding;
using Asambleas.Domain.Common;
using Asambleas.Infrastructure.Identity;
using Asambleas.Web.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Authorize]
[Route("api/ph")]
public sealed class PhOnboardingController : ControllerBase
{
    private readonly PhOnboardingService _ph;
    private readonly PhImportService _import;
    private readonly OwnerInvitationService _invitations;
    private readonly IPhImportWorkbookService _workbook;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;

    public PhOnboardingController(
        PhOnboardingService ph,
        PhImportService import,
        OwnerInvitationService invitations,
        IPhImportWorkbookService workbook,
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager)
    {
        _ph = ph;
        _import = import;
        _invitations = invitations;
        _workbook = workbook;
        _userManager = userManager;
        _signInManager = signInManager;
    }

    [HttpGet]
    [Authorize(Policy = Permissions.PhView)]
    public Task<IReadOnlyList<PhSummaryDto>> List(CancellationToken cancellationToken) =>
        _ph.ListPhAsync(cancellationToken);

    [HttpGet("{propertyHorizontalId:guid}")]
    [Authorize(Policy = Permissions.PhView)]
    public Task<PhDetailDto> Get(Guid propertyHorizontalId, CancellationToken cancellationToken) =>
        _ph.GetPhAsync(propertyHorizontalId, cancellationToken);

    [HttpPost]
    [Authorize(Policy = Permissions.PhManage)]
    public Task<PhDetailDto> Create([FromBody] CreatePhRequest request, CancellationToken cancellationToken) =>
        _ph.CreatePhAsync(request, cancellationToken);

    [HttpPut("{propertyHorizontalId:guid}")]
    [Authorize(Policy = Permissions.PhManage)]
    public Task<PhDetailDto> Update(
        Guid propertyHorizontalId,
        [FromBody] UpdatePhRequest request,
        CancellationToken cancellationToken) =>
        _ph.UpdatePhAsync(propertyHorizontalId, request, cancellationToken);

    [HttpGet("{propertyHorizontalId:guid}/units")]
    [Authorize(Policy = Permissions.UnitView)]
    public Task<IReadOnlyList<UnitDto>> ListUnits(
        Guid propertyHorizontalId,
        [FromQuery] string? search,
        [FromQuery] string? tower,
        [FromQuery] bool? isActive,
        CancellationToken cancellationToken) =>
        _ph.ListUnitsAsync(propertyHorizontalId, search, tower, isActive, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/units")]
    [Authorize(Policy = Permissions.UnitManage)]
    public Task<UnitDto> CreateUnit(
        Guid propertyHorizontalId,
        [FromBody] CreateUnitRequest request,
        CancellationToken cancellationToken) =>
        _ph.CreateUnitAsync(propertyHorizontalId, request, cancellationToken);

    [HttpPut("{propertyHorizontalId:guid}/units/{unitId:guid}")]
    [Authorize(Policy = Permissions.UnitManage)]
    public Task<UnitDto> UpdateUnit(
        Guid propertyHorizontalId,
        Guid unitId,
        [FromBody] UpdateUnitRequest request,
        CancellationToken cancellationToken) =>
        _ph.UpdateUnitAsync(propertyHorizontalId, unitId, request, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/units/{unitId:guid}/active")]
    [Authorize(Policy = Permissions.UnitManage)]
    public Task<UnitDto> SetUnitActive(
        Guid propertyHorizontalId,
        Guid unitId,
        [FromBody] SetActiveRequest request,
        CancellationToken cancellationToken) =>
        _ph.SetUnitActiveAsync(propertyHorizontalId, unitId, request.IsActive, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/units/bulk-generate")]
    [Authorize(Policy = Permissions.UnitManage)]
    public Task<BulkGenerateUnitsResultDto> BulkGenerate(
        Guid propertyHorizontalId,
        [FromBody] BulkGenerateUnitsRequest request,
        CancellationToken cancellationToken) =>
        _ph.BulkGenerateUnitsAsync(propertyHorizontalId, request, cancellationToken);

    [HttpGet("{propertyHorizontalId:guid}/owners")]
    [Authorize(Policy = Permissions.OwnerView)]
    public Task<IReadOnlyList<OwnerListItemDto>> ListOwners(
        Guid propertyHorizontalId,
        [FromQuery] string? search,
        [FromQuery] string? tower,
        [FromQuery] int? floor,
        [FromQuery] string? status,
        [FromQuery] bool? hasEmail,
        [FromQuery] bool? invited,
        [FromQuery] bool? hasUser,
        CancellationToken cancellationToken) =>
        _ph.ListOwnersAsync(
            propertyHorizontalId,
            new OwnerQuery(search, tower, floor, status, hasEmail, invited, hasUser),
            cancellationToken);

    [HttpGet("{propertyHorizontalId:guid}/owners/export")]
    [Authorize(Policy = Permissions.OwnerView)]
    public async Task<IActionResult> ExportOwners(
        Guid propertyHorizontalId,
        [FromQuery] string? search,
        [FromQuery] string? tower,
        [FromQuery] int? floor,
        [FromQuery] string? status,
        [FromQuery] bool? hasEmail,
        [FromQuery] bool? invited,
        [FromQuery] bool? hasUser,
        CancellationToken cancellationToken)
    {
        var bytes = await _ph.ExportOwnersCsvAsync(
            propertyHorizontalId,
            new OwnerQuery(search, tower, floor, status, hasEmail, invited, hasUser),
            cancellationToken);
        return File(bytes, "text/csv; charset=utf-8", "propietarios.csv");
    }

    [HttpPost("{propertyHorizontalId:guid}/owners/validate-bulk")]
    [Authorize(Policy = Permissions.OwnerView)]
    public Task<BulkValidateOwnersResultDto> ValidateOwnersBulk(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken) =>
        _ph.ValidateOwnersBulkAsync(propertyHorizontalId, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/owners/invite-bulk")]
    [Authorize(Policy = Permissions.OwnerInvite)]
    public async Task<BulkInviteResultDto> InviteOwnersBulk(
        Guid propertyHorizontalId,
        [FromBody] BulkInviteRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        var sent = 0;
        var linked = 0;
        var failed = 0;
        var errors = new List<string>();
        foreach (var ownerId in request.OwnerIds.Distinct())
        {
            try
            {
                var result = await _invitations.InviteAsync(propertyHorizontalId, ownerId, cancellationToken);
                if (result.ExistingUserLinked)
                {
                    linked++;
                }
                else
                {
                    sent++;
                }
            }
            catch (DomainException ex)
            {
                failed++;
                errors.Add($"{ownerId}: {ex.Message}");
            }
        }

        return new BulkInviteResultDto(sent, linked, failed, errors);
    }

    [HttpGet("{propertyHorizontalId:guid}/owners/{ownerId:guid}")]
    [Authorize(Policy = Permissions.OwnerView)]
    public Task<OwnerDetailDto> GetOwner(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken) =>
        _ph.GetOwnerAsync(propertyHorizontalId, ownerId, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/owners")]
    [Authorize(Policy = Permissions.OwnerManage)]
    public Task<OwnerDetailDto> CreateOwner(
        Guid propertyHorizontalId,
        [FromBody] CreateOwnerRequest request,
        CancellationToken cancellationToken) =>
        _ph.CreateOwnerAsync(propertyHorizontalId, request, cancellationToken);

    [HttpPut("{propertyHorizontalId:guid}/owners/{ownerId:guid}")]
    [Authorize(Policy = Permissions.OwnerManage)]
    public Task<OwnerDetailDto> UpdateOwner(
        Guid propertyHorizontalId,
        Guid ownerId,
        [FromBody] UpdateOwnerRequest request,
        CancellationToken cancellationToken) =>
        _ph.UpdateOwnerAsync(propertyHorizontalId, ownerId, request, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/owners/{ownerId:guid}/deactivate")]
    [Authorize(Policy = Permissions.OwnerManage)]
    public Task<OwnerDetailDto> DeactivateOwner(
        Guid propertyHorizontalId,
        Guid ownerId,
        [FromBody] DeactivateEntityRequest? request,
        CancellationToken cancellationToken) =>
        _ph.DeactivateOwnerAsync(propertyHorizontalId, ownerId, request, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/owners/{ownerId:guid}/reactivate")]
    [Authorize(Policy = Permissions.OwnerManage)]
    public Task<OwnerDetailDto> ReactivateOwner(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken) =>
        _ph.ReactivateOwnerAsync(propertyHorizontalId, ownerId, cancellationToken);

    [HttpGet("{propertyHorizontalId:guid}/owners/{ownerId:guid}/delete-evaluation")]
    [Authorize(Policy = Permissions.OwnerManage)]
    public Task<EntityDeleteEvaluationDto> EvaluateOwnerDelete(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken) =>
        _ph.EvaluateOwnerDeleteAsync(propertyHorizontalId, ownerId, cancellationToken);

    [HttpDelete("{propertyHorizontalId:guid}/owners/{ownerId:guid}")]
    [Authorize(Policy = Permissions.OwnerManage)]
    public async Task<IActionResult> DeleteOwner(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken)
    {
        await _ph.DeleteOwnerAsync(propertyHorizontalId, ownerId, cancellationToken);
        return NoContent();
    }

    [HttpPost("{propertyHorizontalId:guid}/ownerships")]
    [Authorize(Policy = Permissions.OwnerManage)]
    public Task<OwnerUnitLinkDto> CreateOwnership(
        Guid propertyHorizontalId,
        [FromBody] CreateOwnershipRequest request,
        CancellationToken cancellationToken) =>
        _ph.CreateOwnershipAsync(propertyHorizontalId, request, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/ownerships/{ownershipId:guid}/end")]
    [Authorize(Policy = Permissions.OwnerManage)]
    public async Task<IActionResult> EndOwnership(
        Guid propertyHorizontalId,
        Guid ownershipId,
        CancellationToken cancellationToken)
    {
        await _ph.EndOwnershipAsync(propertyHorizontalId, ownershipId, cancellationToken);
        return NoContent();
    }

    [HttpGet("{propertyHorizontalId:guid}/coefficients")]
    [Authorize(Policy = Permissions.PhView)]
    public Task<CoefficientValidationDto> Coefficients(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken) =>
        _ph.ValidateCoefficientsAsync(propertyHorizontalId, cancellationToken);

    [HttpGet("{propertyHorizontalId:guid}/readiness")]
    [Authorize(Policy = Permissions.PhView)]
    public Task<PhReadinessDto> Readiness(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken) =>
        _ph.GetReadinessAsync(propertyHorizontalId, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/ready")]
    [Authorize(Policy = Permissions.PhManage)]
    public Task<PhDetailDto> MarkReady(Guid propertyHorizontalId, CancellationToken cancellationToken) =>
        _ph.MarkReadyForAssemblyAsync(propertyHorizontalId, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/activate")]
    [Authorize(Policy = Permissions.PhManage)]
    public Task<PhDetailDto> Activate(Guid propertyHorizontalId, CancellationToken cancellationToken) =>
        _ph.ActivatePhAsync(propertyHorizontalId, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/deactivate")]
    [Authorize(Policy = Permissions.PhManage)]
    public Task<PhDetailDto> DeactivatePh(
        Guid propertyHorizontalId,
        [FromBody] DeactivateEntityRequest? request,
        CancellationToken cancellationToken) =>
        _ph.DeactivatePhAsync(propertyHorizontalId, request, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/reactivate")]
    [Authorize(Policy = Permissions.PhManage)]
    public Task<PhDetailDto> ReactivatePh(Guid propertyHorizontalId, CancellationToken cancellationToken) =>
        _ph.ReactivatePhAsync(propertyHorizontalId, cancellationToken);

    [HttpGet("{propertyHorizontalId:guid}/delete-evaluation")]
    [Authorize(Policy = Permissions.PhManage)]
    public Task<EntityDeleteEvaluationDto> EvaluatePhDelete(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken) =>
        _ph.EvaluatePhDeleteAsync(propertyHorizontalId, cancellationToken);

    [HttpDelete("{propertyHorizontalId:guid}")]
    [Authorize(Policy = Permissions.PhManage)]
    public async Task<IActionResult> DeletePh(Guid propertyHorizontalId, CancellationToken cancellationToken)
    {
        await _ph.DeletePhAsync(propertyHorizontalId, cancellationToken);
        return NoContent();
    }

    [HttpGet("memberships/mine")]
    [Authorize(Policy = Permissions.PhView)]
    public Task<IReadOnlyList<PhMembershipDto>> MyMemberships(CancellationToken cancellationToken) =>
        _ph.ListMyMembershipsAsync(cancellationToken);

    [HttpPost("switch")]
    [Authorize(Policy = Permissions.PhView)]
    public async Task<IReadOnlyList<PhMembershipDto>> SwitchPh(
        [FromBody] SwitchPhRequest request,
        CancellationToken cancellationToken)
    {
        var memberships = await _ph.SwitchActivePhContextAsync(request.PropertyHorizontalId, cancellationToken);

        var user = await _userManager.GetUserAsync(User)
            ?? throw new DomainException("USER_NOT_FOUND", "User not found.");

        var existing = await _userManager.GetClaimsAsync(user);
        var oldPh = existing.Where(c => c.Type == AsambleasClaimTypes.PropertyHorizontalId).ToList();
        foreach (var claim in oldPh)
        {
            await _userManager.RemoveClaimAsync(user, claim);
        }

        await _userManager.AddClaimAsync(
            user,
            new Claim(AsambleasClaimTypes.PropertyHorizontalId, request.PropertyHorizontalId.ToString("D")));

        var roles = (await _userManager.GetRolesAsync(user)).ToList();
        if (roles.Count == 0 && !string.IsNullOrWhiteSpace(user.DemoRole))
        {
            roles.Add(user.DemoRole);
        }

        var permissions = RolePermissionMap.GetPermissions(roles).ToList();
        var refreshedClaims = await _userManager.GetClaimsAsync(user);
        var extra = BuildSessionClaims(user, roles, permissions, refreshedClaims);
        await _signInManager.SignOutAsync();
        await _signInManager.SignInWithClaimsAsync(user, isPersistent: false, extra);

        return memberships;
    }

    [HttpGet("{propertyHorizontalId:guid}/import/template")]
    [Authorize(Policy = Permissions.PhImport)]
    public IActionResult DownloadTemplate(Guid propertyHorizontalId)
    {
        var bytes = _import.DownloadTemplate();
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ASAMBLEAS-import-template.xlsx");
    }

    [HttpPost("{propertyHorizontalId:guid}/import/analyze")]
    [Authorize(Policy = Permissions.PhImport)]
    [RequestSizeLimit(20_000_000)]
    public async Task<ImportAnalyzeResultDto> AnalyzeImport(
        Guid propertyHorizontalId,
        IFormFile file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            throw new DomainException("IMPORT_FILE_REQUIRED", "Upload a CSV or XLSX file.");
        }

        await using var stream = file.OpenReadStream();
        var name = file.FileName ?? string.Empty;
        if (name.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)
            || string.Equals(file.ContentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", StringComparison.OrdinalIgnoreCase))
        {
            var (headers, rows) = _workbook.ParseWorkbook(stream);
            return await _import.AnalyzeXlsxAsync(propertyHorizontalId, headers, rows, cancellationToken);
        }

        return await _import.AnalyzeCsvAsync(propertyHorizontalId, stream, cancellationToken);
    }

    [HttpPost("{propertyHorizontalId:guid}/import/validate")]
    [Authorize(Policy = Permissions.PhImport)]
    public Task<ImportPreviewDto> ValidateImport(
        Guid propertyHorizontalId,
        [FromBody] ImportValidateRequest request,
        CancellationToken cancellationToken) =>
        _import.ValidateAsync(request, cancellationToken);

    [HttpPost("{propertyHorizontalId:guid}/import/commit")]
    [Authorize(Policy = Permissions.PhImport)]
    public Task<ImportCommitResultDto> CommitImport(
        Guid propertyHorizontalId,
        [FromBody] ImportValidateRequest request,
        CancellationToken cancellationToken) =>
        _import.CommitAsync(request, cancellationToken);

    [HttpGet("{propertyHorizontalId:guid}/import/{sessionId:guid}/errors")]
    [Authorize(Policy = Permissions.PhImport)]
    public IActionResult DownloadImportErrors(Guid propertyHorizontalId, Guid sessionId)
    {
        var bytes = _import.BuildErrorReport(sessionId);
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "IMPORT-ERRORS.xlsx");
    }

    [HttpPost("{propertyHorizontalId:guid}/owners/{ownerId:guid}/invite")]
    [Authorize(Policy = Permissions.OwnerInvite)]
    public Task<InviteOwnerResultDto> InviteOwner(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken) =>
        _invitations.InviteAsync(propertyHorizontalId, ownerId, cancellationToken);

    [AllowAnonymous]
    [HttpPost("invitations/activate")]
    public async Task<IActionResult> ActivateInvitation(
        [FromBody] ActivateInvitationRequest request,
        CancellationToken cancellationToken)
    {
        await _invitations.ActivateAsync(request, cancellationToken);
        return Ok(new { activated = true });
    }

    private static List<Claim> BuildSessionClaims(
        ApplicationUser user,
        IReadOnlyList<string> roles,
        IReadOnlyCollection<string> permissions,
        IList<Claim> existingClaims)
    {
        var claims = new List<Claim>
        {
            new(AsambleasClaimTypes.TenantId, user.TenantId.ToString("D")),
            new(AsambleasClaimTypes.DisplayName, user.DisplayName)
        };

        if (user.OrganizationId is Guid orgId)
        {
            claims.Add(new Claim(AsambleasClaimTypes.OrganizationId, orgId.ToString("D")));
        }

        var phClaim = existingClaims.FirstOrDefault(c => c.Type == AsambleasClaimTypes.PropertyHorizontalId);
        if (phClaim is not null)
        {
            claims.Add(new Claim(AsambleasClaimTypes.PropertyHorizontalId, phClaim.Value));
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
}

public sealed record SetActiveRequest(bool IsActive);
