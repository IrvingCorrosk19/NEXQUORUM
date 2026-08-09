namespace Asambleas.Web.Controllers;

using System.Security.Claims;
using Asambleas.Application.Security;
using Asambleas.Contracts.Auth;
using Asambleas.Infrastructure.Identity;
using Asambleas.Infrastructure.Seed;
using Asambleas.Web.Middleware;
using Asambleas.Web.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Hosting;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager)
    {
        _userManager = userManager;
        _signInManager = signInManager;
    }

    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting("auth-login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        // Remote pilot/production must not accept credentials over plain HTTP.
        var forwardedProto = Request.Headers["X-Forwarded-Proto"].FirstOrDefault();
        var isHttps = Request.IsHttps
            || string.Equals(forwardedProto, "https", StringComparison.OrdinalIgnoreCase);
        var allowInsecure = HttpContext.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment()
            || HttpContext.RequestServices.GetRequiredService<IConfiguration>()
                .GetValue("ASAMBLEAS_ALLOW_INSECURE_LOGIN", false);
        if (!isHttps && !allowInsecure)
        {
            return StatusCode(StatusCodes.Status403Forbidden, CreateProblem(
                "No pudimos iniciar sesión. Usa HTTPS."));
        }

        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(CreateProblem("No pudimos iniciar sesión. Verifica tus credenciales."));
        }

        if (string.Equals(request.Password, DemoPasswordResolver.RevokedExposedPassword, StringComparison.Ordinal))
        {
            return Unauthorized(CreateProblem("No pudimos iniciar sesión. Verifica tus credenciales."));
        }

        var user = await _userManager.FindByEmailAsync(request.Email.Trim());
        if (user is null)
        {
            return Unauthorized(CreateProblem("No pudimos iniciar sesión. Verifica tus credenciales."));
        }

        var check = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (check.IsLockedOut)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests,
                CreateProblem("No pudimos iniciar sesión. Intenta de nuevo más tarde."));
        }

        if (!check.Succeeded)
        {
            return Unauthorized(CreateProblem("No pudimos iniciar sesión. Verifica tus credenciales."));
        }

        var roles = (await _userManager.GetRolesAsync(user)).ToList();
        if (roles.Count == 0 && !string.IsNullOrWhiteSpace(user.DemoRole))
        {
            roles.Add(user.DemoRole);
        }

        var existingClaims = await _userManager.GetClaimsAsync(user);
        var permissions = RolePermissionMap.GetPermissions(roles).ToList();
        var extraClaims = BuildClaims(user, roles, permissions, existingClaims);

        // Mitigate session fixation: clear any prior cookie before issuing a new identity.
        await _signInManager.SignOutAsync();
        await _signInManager.SignInWithClaimsAsync(user, isPersistent: false, extraClaims);

        return Ok(new LoginResponse(
            user.Id,
            user.DisplayName,
            user.Email ?? request.Email,
            user.TenantId,
            "OCEAN",
            roles,
            permissions));
    }

    [Authorize]
    [HttpPost("logout")]
    [IgnoreAntiforgeryToken]
    public async Task<ActionResult<LogoutResponse>> Logout()
    {
        await _signInManager.SignOutAsync();
        return Ok(new LogoutResponse(true));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserDto>> Me()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
        {
            return Unauthorized();
        }

        var roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (roles.Count == 0)
        {
            roles = (await _userManager.GetRolesAsync(user)).ToList();
            if (roles.Count == 0 && !string.IsNullOrWhiteSpace(user.DemoRole))
            {
                roles = [user.DemoRole];
            }
        }

        var permissions = User.FindAll(AsambleasClaimTypes.Permission)
            .Select(c => c.Value)
            .Distinct(StringComparer.Ordinal)
            .ToList();
        if (permissions.Count == 0)
        {
            permissions = RolePermissionMap.GetPermissions(roles).ToList();
        }

        return Ok(new CurrentUserDto(
            user.Id,
            user.DisplayName,
            user.Email ?? string.Empty,
            user.TenantId,
            "OCEAN",
            ParseGuidClaim(AsambleasClaimTypes.OrganizationId) ?? user.OrganizationId,
            ParseGuidClaim(AsambleasClaimTypes.PropertyHorizontalId),
            roles,
            permissions));
    }

    [AllowAnonymous]
    [HttpGet("antiforgery")]
    public IActionResult Antiforgery([FromServices] Microsoft.AspNetCore.Antiforgery.IAntiforgery antiforgery)
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new
        {
            requestToken = tokens.RequestToken,
            headerName = "RequestVerificationToken"
        });
    }

    private static List<Claim> BuildClaims(
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
        else if (user.TenantId == DemoSeedConstants.TenantOceanId)
        {
            claims.Add(new Claim(AsambleasClaimTypes.PropertyHorizontalId, DemoSeedConstants.PhOceanId.ToString("D")));
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

    private Guid? ParseGuidClaim(string claimType)
    {
        var value = User.FindFirstValue(claimType);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    private ProblemDetails CreateProblem(string detail) =>
        new()
        {
            Detail = detail,
            Extensions = { ["correlationId"] = CorrelationIdMiddleware.Get(HttpContext) }
        };
}
