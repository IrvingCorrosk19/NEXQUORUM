namespace Asambleas.Web.Controllers;

using System.Security.Claims;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Infrastructure.Identity;
using Asambleas.Web.Middleware;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

[ApiController]
[Route("api/auth/external")]
public sealed class ExternalAuthController : ControllerBase
{
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly ExternalAuthService _externalAuth;
    private readonly AssemblyAccessLinkService _accessLinks;
    private readonly IConfiguration _configuration;
    private readonly IVerifiedJoinProofService _joinProofs;

    public ExternalAuthController(
        SignInManager<ApplicationUser> signInManager,
        ExternalAuthService externalAuth,
        AssemblyAccessLinkService accessLinks,
        IConfiguration configuration,
        IVerifiedJoinProofService joinProofs)
    {
        _signInManager = signInManager;
        _externalAuth = externalAuth;
        _accessLinks = accessLinks;
        _configuration = configuration;
        _joinProofs = joinProofs;
    }

    [AllowAnonymous]
    [HttpGet("providers")]
    public ActionResult<object> Providers()
    {
        var google = IsProviderConfigured(ExternalAuthService.Google);
        var microsoft = IsProviderConfigured(ExternalAuthService.Microsoft);
        return Ok(new { google, microsoft });
    }

    [AllowAnonymous]
    [HttpGet("{provider}/challenge")]
    [EnableRateLimiting("auth-login")]
    public IActionResult ChallengeProvider(string provider, [FromQuery] string? returnUrl = null, [FromQuery] bool link = false)
    {
        if (!ExternalAuthService.IsSupportedProvider(provider))
        {
            return BadRequest(Problem("Proveedor no soportado."));
        }

        provider = ExternalAuthService.NormalizeProvider(provider);
        if (!IsProviderConfigured(provider))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                Problem($"El inicio con {provider} no está configurado en este entorno."));
        }

        var safeReturn = SafeReturnUrl.Normalize(returnUrl) ?? "/";
        var redirectUrl = Url.Action(nameof(Callback), new { provider })
                          ?? $"/api/auth/external/{provider}/callback";
        var props = _signInManager.ConfigureExternalAuthenticationProperties(provider, redirectUrl);
        props.Items["returnUrl"] = safeReturn;
        props.Items["link"] = link && User.Identity?.IsAuthenticated == true ? "1" : "0";

        return Challenge(props, provider);
    }

    [AllowAnonymous]
    [HttpGet("{provider}/callback")]
    [EnableRateLimiting("auth-login")]
    public async Task<IActionResult> Callback(
        string provider,
        [FromQuery] string? remoteError = null,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(remoteError))
        {
            return Redirect(LoginError("cancelled"));
        }

        if (!ExternalAuthService.IsSupportedProvider(provider))
        {
            return Redirect(LoginError("unsupported"));
        }

        provider = ExternalAuthService.NormalizeProvider(provider);
        var info = await _signInManager.GetExternalLoginInfoAsync();
        if (info is null)
        {
            return Redirect(LoginError("cancelled"));
        }

        var external = ExternalAuthService.TryParsePrincipal(provider, info.Principal);
        if (external is null)
        {
            await _signInManager.SignOutAsync();
            return Redirect(LoginError("claims"));
        }

        Guid? authUserId = null;
        var linkFlag = info.AuthenticationProperties?.Items.TryGetValue("link", out var linkRaw) == true
            ? linkRaw
            : null;
        var linkRequested = string.Equals(linkFlag, "1", StringComparison.Ordinal);
        if (linkRequested && Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid))
        {
            authUserId = uid;
        }

        var outcome = await _externalAuth.CompleteExternalLoginAsync(external, authUserId, cancellationToken);

        // Drop the transient external cookie; application cookie is issued next.
        await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);

        if (!outcome.Succeeded || outcome.User is null)
        {
            return Redirect(LoginError(outcome.ErrorCode ?? "failed", outcome.Message));
        }

        if (Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var prior) && prior != Guid.Empty)
        {
            _joinProofs.InvalidateUser(prior);
        }

        await _externalAuth.SignInAsync(outcome.User, cancellationToken);

        string? rawReturn = null;
        if (info.AuthenticationProperties?.Items.TryGetValue("returnUrl", out var ret) == true)
        {
            rawReturn = ret;
        }

        var returnUrl = SafeReturnUrl.Normalize(rawReturn) ?? "/";
        returnUrl = AssemblyAccessLinkService.PreferParticipantRoomOverLobby(returnUrl);
        if (returnUrl is "/" or "/index.html")
        {
            var live = await _accessLinks.TryResolveOwnerLiveRedirectAsync(outcome.User.Id, cancellationToken);
            if (!string.IsNullOrWhiteSpace(live))
            {
                return LocalRedirect(live);
            }

            return LocalRedirect("/?oauth=ok");
        }

        return LocalRedirect(returnUrl);
    }

    [Authorize]
    [HttpPost("{provider}/unlink")]
    [IgnoreAntiforgeryToken]
    public async Task<IActionResult> Unlink(string provider, CancellationToken cancellationToken)
    {
        if (!ExternalAuthService.IsSupportedProvider(provider))
        {
            return BadRequest(Problem("Proveedor no soportado."));
        }

        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            return Unauthorized();
        }

        var result = await _externalAuth.UnlinkAsync(userId, provider, cancellationToken);
        if (!result.Succeeded)
        {
            return BadRequest(Problem(result.Errors.FirstOrDefault()?.Description ?? "No se pudo desvincular."));
        }

        return Ok(new { unlinked = true, provider = ExternalAuthService.NormalizeProvider(provider) });
    }

    private bool IsProviderConfigured(string provider)
    {
        static bool IsRealSecret(string? value) =>
            !string.IsNullOrWhiteSpace(value)
            && !string.Equals(value, "unconfigured", StringComparison.OrdinalIgnoreCase);

        return provider == ExternalAuthService.Google
            ? IsRealSecret(_configuration["Authentication:Google:ClientId"])
              && IsRealSecret(_configuration["Authentication:Google:ClientSecret"])
            : IsRealSecret(_configuration["Authentication:Microsoft:ClientId"])
              && IsRealSecret(_configuration["Authentication:Microsoft:ClientSecret"]);
    }

    private string LoginError(string code, string? detail = null)
    {
        var q = $"?oauth_error={Uri.EscapeDataString(code)}";
        if (!string.IsNullOrWhiteSpace(detail))
        {
            q += $"&oauth_detail={Uri.EscapeDataString(detail)}";
        }

        return "/" + q;
    }

    private ProblemDetails Problem(string detail) =>
        new()
        {
            Detail = detail,
            Extensions = { ["correlationId"] = CorrelationIdMiddleware.Get(HttpContext) }
        };
}
