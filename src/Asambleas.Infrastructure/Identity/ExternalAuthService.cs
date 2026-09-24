namespace Asambleas.Infrastructure.Identity;

using System.Security.Claims;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

public sealed record ExternalAuthPrincipal(
    string Provider,
    string ProviderSubject,
    string Email,
    bool EmailVerified,
    string DisplayName);

public sealed record ExternalAuthOutcome(
    bool Succeeded,
    ApplicationUser? User,
    string? ErrorCode,
    string Message,
    bool Linked = false);

/// <summary>
/// Links Google/Microsoft identities via ASP.NET Identity AspNetUserLogins (Provider + ProviderKey unique).
/// Never stores provider passwords or OAuth tokens.
/// </summary>
public sealed class ExternalAuthService
{
    public const string Google = "Google";
    public const string Microsoft = "Microsoft";

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IAsambleasDbContext _db;
    private readonly IOwnerPortalIdentityService _identity;
    private readonly AssemblyAccessLinkService _accessLinks;
    private readonly IAuditService _audit;
    private readonly CurrentTenant _currentTenant;
    private readonly ILogger<ExternalAuthService> _logger;

    public ExternalAuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IAsambleasDbContext db,
        IOwnerPortalIdentityService identity,
        AssemblyAccessLinkService accessLinks,
        IAuditService audit,
        CurrentTenant currentTenant,
        ILogger<ExternalAuthService> logger)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _db = db;
        _identity = identity;
        _accessLinks = accessLinks;
        _audit = audit;
        _currentTenant = currentTenant;
        _logger = logger;
    }

    public static bool IsSupportedProvider(string? provider) =>
        string.Equals(provider, Google, StringComparison.OrdinalIgnoreCase)
        || string.Equals(provider, Microsoft, StringComparison.OrdinalIgnoreCase);

    public static string NormalizeProvider(string provider) =>
        string.Equals(provider, Microsoft, StringComparison.OrdinalIgnoreCase) ? Microsoft : Google;

    public static ExternalAuthPrincipal? TryParsePrincipal(string provider, ClaimsPrincipal principal)
    {
        var subject = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? principal.FindFirstValue("sub");
        var email = principal.FindFirstValue(ClaimTypes.Email)
            ?? principal.FindFirstValue("email")
            ?? principal.FindFirstValue("preferred_username");
        if (string.IsNullOrWhiteSpace(subject) || string.IsNullOrWhiteSpace(email))
        {
            return null;
        }

        var verified = IsEmailVerified(principal);
        var name = principal.FindFirstValue(ClaimTypes.Name)
            ?? principal.FindFirstValue("name")
            ?? email.Split('@')[0];

        return new ExternalAuthPrincipal(
            NormalizeProvider(provider),
            subject.Trim(),
            email.Trim().ToLowerInvariant(),
            verified,
            name.Trim());
    }

    public static bool IsEmailVerified(ClaimsPrincipal principal)
    {
        var v = principal.FindFirstValue("email_verified")
            ?? principal.FindFirstValue("emailverified")
            ?? principal.FindFirst("email_verified")?.Value;
        if (string.Equals(v, "true", StringComparison.OrdinalIgnoreCase)
            || string.Equals(v, "1", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Microsoft personal accounts often omit email_verified; treat presence of email claim
        // from the ID token as verified when issuer is Microsoft (OIDC already validated the token).
        var iss = principal.FindFirstValue("iss") ?? string.Empty;
        if (iss.Contains("login.microsoftonline.com", StringComparison.OrdinalIgnoreCase)
            || iss.Contains("sts.windows.net", StringComparison.OrdinalIgnoreCase)
            || iss.Contains("login.live.com", StringComparison.OrdinalIgnoreCase))
        {
            return !string.IsNullOrWhiteSpace(principal.FindFirstValue(ClaimTypes.Email)
                ?? principal.FindFirstValue("email")
                ?? principal.FindFirstValue("preferred_username"));
        }

        return false;
    }

    public async Task<ExternalAuthOutcome> CompleteExternalLoginAsync(
        ExternalAuthPrincipal external,
        Guid? authenticatedUserId,
        CancellationToken cancellationToken = default)
    {
        await WriteAuditAsync(
            AuditEventType.ExternalLoginAttempt,
            tenantId: null,
            userId: authenticatedUserId,
            metadata: new { external.Provider, emailDomain = DomainOf(external.Email) },
            cancellationToken);

        if (!external.EmailVerified)
        {
            return await FailAsync("EMAIL_NOT_VERIFIED",
                "El correo del proveedor no está verificado. Usa una cuenta con email confirmado.",
                external, cancellationToken);
        }

        var byLogin = await _userManager.FindByLoginAsync(external.Provider, external.ProviderSubject);
        if (byLogin is not null)
        {
            if (authenticatedUserId is Guid authId && authId != byLogin.Id)
            {
                return await FailAsync("LOGIN_ALREADY_LINKED",
                    "Esta cuenta externa ya está vinculada a otro usuario.",
                    external, cancellationToken);
            }

            var gate = await GateUserAsync(byLogin, external, cancellationToken);
            if (gate is not null)
            {
                return gate;
            }

            return await SucceedAsync(byLogin, linked: false, external, cancellationToken);
        }

        // Authenticated linking (explicit).
        if (authenticatedUserId is Guid linkUserId)
        {
            var current = await _userManager.FindByIdAsync(linkUserId.ToString())
                ?? throw new InvalidOperationException("Authenticated user missing.");
            var currentEmail = (current.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (!string.Equals(currentEmail, external.Email, StringComparison.Ordinal))
            {
                return await FailAsync("EMAIL_MISMATCH",
                    "El correo del proveedor no coincide con tu sesión actual.",
                    external, cancellationToken);
            }

            var link = await _userManager.AddLoginAsync(
                current,
                new UserLoginInfo(external.Provider, external.ProviderSubject, external.Provider));
            if (!link.Succeeded)
            {
                return await FailAsync("LINK_FAILED",
                    "No pudimos vincular la cuenta externa.",
                    external, cancellationToken);
            }

            await WriteAuditAsync(
                AuditEventType.ExternalLoginLinked,
                current.TenantId,
                current.Id,
                new { external.Provider, userId = current.Id },
                cancellationToken);
            var gateLink = await GateUserAsync(current, external, cancellationToken);
            if (gateLink is not null)
            {
                return gateLink;
            }

            return await SucceedAsync(current, linked: true, external, cancellationToken);
        }

        // Existing local user with same verified email: do not auto-link without session,
        // except passwordless owner accounts (no user-known password) on first external link.
        var byEmail = await _userManager.FindByEmailAsync(external.Email);
        if (byEmail is not null)
        {
            var claims = await _userManager.GetClaimsAsync(byEmail);
            var passwordless = claims.Any(c =>
                c.Type == "asambleas:auth" && c.Value == "passwordless");
            var logins = await _userManager.GetLoginsAsync(byEmail);
            var isOwnerLinked = await _db.Owners.IgnoreQueryFilters()
                .AnyAsync(o => o.UserId == byEmail.Id, cancellationToken);

            if (passwordless && isOwnerLinked && logins.Count == 0)
            {
                var add = await _userManager.AddLoginAsync(
                    byEmail,
                    new UserLoginInfo(external.Provider, external.ProviderSubject, external.Provider));
                if (!add.Succeeded)
                {
                    return await FailAsync("LINK_FAILED",
                        "No pudimos vincular la cuenta externa.",
                        external, cancellationToken);
                }

                await WriteAuditAsync(
                    AuditEventType.ExternalLoginLinked,
                    byEmail.TenantId,
                    byEmail.Id,
                    new { external.Provider, userId = byEmail.Id, mode = "owner-passwordless" },
                    cancellationToken);
                var gatePw = await GateUserAsync(byEmail, external, cancellationToken);
                if (gatePw is not null)
                {
                    return gatePw;
                }

                return await SucceedAsync(byEmail, linked: true, external, cancellationToken);
            }

            return await FailAsync(
                "ACCOUNT_EXISTS",
                "Ya existe una cuenta con este correo. Usa «Recibir código» o inicia sesión con tu contraseña de mesa.",
                external,
                cancellationToken);
        }

        // No local user: only allow if there is an invited/registered owner with this email.
        var owner = await _db.Owners.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                o => o.Email.ToLower() == external.Email
                     && o.Status != OwnerLifecycleStatus.Inactive,
                cancellationToken);

        var pendingInvite = await _db.OwnerInvitations
            .IgnoreQueryFilters()
            .AsNoTracking()
            .AnyAsync(
                i => i.Email.ToLower() == external.Email
                     && i.ConsumedAtUtc == null
                     && i.ExpiresAtUtc > DateTimeOffset.UtcNow,
                cancellationToken);

        if (owner is null && !pendingInvite)
        {
            return await FailAsync(
                "NO_ASSOCIATION",
                "Esta cuenta todavía no está asociada con una propiedad o invitación.",
                external,
                cancellationToken);
        }

        var tenantId = owner?.TenantId
            ?? await _db.OwnerInvitations.IgnoreQueryFilters().AsNoTracking()
                .Where(i => i.Email.ToLower() == external.Email)
                .Select(i => i.TenantId)
                .FirstAsync(cancellationToken);

        Guid? organizationId = null;
        if (owner?.RegisteredPropertyHorizontalId is Guid phId)
        {
            organizationId = await _db.PropertyHorizontals.IgnoreQueryFilters().AsNoTracking()
                .Where(p => p.Id == phId)
                .Select(p => (Guid?)p.OrganizationId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        var userId = await _identity.EnsureOwnerUserPasswordlessAsync(
            tenantId,
            organizationId,
            external.Email,
            external.DisplayName,
            cancellationToken);

        var created = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new InvalidOperationException("Owner user missing after provision.");

        if (owner is not null && owner.UserId != userId)
        {
            owner.UserId = userId;
            await _db.SaveChangesAsync(cancellationToken);
        }

        var addLogin = await _userManager.AddLoginAsync(
            created,
            new UserLoginInfo(external.Provider, external.ProviderSubject, external.Provider));
        if (!addLogin.Succeeded)
        {
            return await FailAsync("LINK_FAILED",
                "No pudimos vincular la cuenta externa.",
                external, cancellationToken);
        }

        await WriteAuditAsync(
            AuditEventType.ExternalLoginLinked,
            created.TenantId,
            created.Id,
            new { external.Provider, userId = created.Id, mode = "invite-or-owner" },
            cancellationToken);

        var gateNew = await GateUserAsync(created, external, cancellationToken);
        if (gateNew is not null)
        {
            return gateNew;
        }

        return await SucceedAsync(created, linked: true, external, cancellationToken);
    }

    private async Task<ExternalAuthOutcome?> GateUserAsync(
        ApplicationUser user,
        ExternalAuthPrincipal external,
        CancellationToken cancellationToken)
    {
        if (await _userManager.IsLockedOutAsync(user))
        {
            return await FailAsync(
                "USER_DISABLED",
                "Tu cuenta está desactivada. Contacta al administrador de tu propiedad.",
                external,
                cancellationToken);
        }

        var roles = (await _userManager.GetRolesAsync(user)).ToList();
        if (roles.Count == 0 && !string.IsNullOrWhiteSpace(user.DemoRole))
        {
            roles.Add(user.DemoRole);
        }

        var isPrivileged = roles.Any(r =>
            !string.Equals(r, Roles.Owner, StringComparison.OrdinalIgnoreCase));

        if (isPrivileged)
        {
            return null;
        }

        var owners = await _db.Owners.IgnoreQueryFilters()
            .Where(o => o.UserId == user.Id)
            .Select(o => o.Status)
            .ToListAsync(cancellationToken);

        if (owners.Count > 0 && owners.All(s => s == OwnerLifecycleStatus.Inactive))
        {
            return await FailAsync(
                "RELATION_INACTIVE",
                "Tu vínculo con la propiedad está inactivo. Contacta a la administración.",
                external,
                cancellationToken);
        }

        return null;
    }

    public async Task SignInAsync(ApplicationUser user, CancellationToken cancellationToken = default)
    {
        var roles = (await _userManager.GetRolesAsync(user)).ToList();
        if (roles.Count == 0 && !string.IsNullOrWhiteSpace(user.DemoRole))
        {
            roles.Add(user.DemoRole);
        }

        var isLinkedOwner = await _db.Owners.IgnoreQueryFilters()
            .AnyAsync(o => o.UserId == user.Id && o.Status != OwnerLifecycleStatus.Inactive, cancellationToken);
        if (isLinkedOwner && !roles.Contains(Roles.Owner, StringComparer.OrdinalIgnoreCase))
        {
            roles.Add(Roles.Owner);
        }

        var existingClaims = await _userManager.GetClaimsAsync(user);
        var permissions = RolePermissionMap.GetPermissions(roles).ToList();
        var claims = BuildSessionClaims(roles, permissions, existingClaims);

        await _signInManager.SignOutAsync();
        await _signInManager.SignInWithClaimsAsync(user, isPersistent: false, claims);
    }

    public async Task<IdentityResult> UnlinkAsync(Guid userId, string provider, CancellationToken cancellationToken = default)
    {
        provider = NormalizeProvider(provider);
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new InvalidOperationException("User not found.");
        var logins = await _userManager.GetLoginsAsync(user);
        var match = logins.FirstOrDefault(l => string.Equals(l.LoginProvider, provider, StringComparison.OrdinalIgnoreCase));
        if (match is null)
        {
            return IdentityResult.Failed(new IdentityError { Description = "No hay vínculo con ese proveedor." });
        }

        var hasPassword = await _userManager.HasPasswordAsync(user);
        if (!hasPassword && logins.Count <= 1)
        {
            return IdentityResult.Failed(new IdentityError
            {
                Description = "No puedes desvincular el único método de acceso. Define una contraseña primero."
            });
        }

        var result = await _userManager.RemoveLoginAsync(user, match.LoginProvider, match.ProviderKey);
        if (result.Succeeded)
        {
            await WriteAuditAsync(
                AuditEventType.ExternalLoginUnlinked,
                user.TenantId,
                userId,
                new { provider, userId },
                cancellationToken);
        }

        return result;
    }

    private async Task<ExternalAuthOutcome> SucceedAsync(
        ApplicationUser user,
        bool linked,
        ExternalAuthPrincipal external,
        CancellationToken cancellationToken)
    {
        var ownerId = await _db.Owners.IgnoreQueryFilters().AsNoTracking()
            .Where(o => o.UserId == user.Id)
            .Select(o => (Guid?)o.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (ownerId is Guid oid)
        {
            await _accessLinks.EnrollOwnerIntoOpenConvocationsAsync(
                oid,
                user.Id,
                user.DisplayName,
                cancellationToken);
        }

        await WriteAuditAsync(
            AuditEventType.ExternalLoginSucceeded,
            user.TenantId,
            user.Id,
            new { external.Provider, userId = user.Id, linked },
            cancellationToken);
        return new ExternalAuthOutcome(true, user, null, "OK", linked);
    }

    private async Task<ExternalAuthOutcome> FailAsync(
        string code,
        string message,
        ExternalAuthPrincipal external,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation("External login failed provider={Provider} code={Code}", external.Provider, code);

        Guid? tenantId = null;
        Guid? userId = null;
        var existing = await _userManager.FindByEmailAsync(external.Email);
        if (existing is not null)
        {
            tenantId = existing.TenantId;
            userId = existing.Id;
        }
        else
        {
            tenantId = await _db.Owners.IgnoreQueryFilters().AsNoTracking()
                .Where(o => o.Email.ToLower() == external.Email)
                .Select(o => (Guid?)o.TenantId)
                .FirstOrDefaultAsync(cancellationToken)
                ?? await _db.OwnerInvitations.IgnoreQueryFilters().AsNoTracking()
                    .Where(i => i.Email.ToLower() == external.Email)
                    .Select(i => (Guid?)i.TenantId)
                    .FirstOrDefaultAsync(cancellationToken);
        }

        await WriteAuditAsync(
            AuditEventType.ExternalLoginFailed,
            tenantId,
            userId,
            new { external.Provider, code, emailDomain = DomainOf(external.Email) },
            cancellationToken);
        return new ExternalAuthOutcome(false, null, code, message);
    }

    private async Task WriteAuditAsync(
        string eventType,
        Guid? tenantId,
        Guid? userId,
        object metadata,
        CancellationToken cancellationToken)
    {
        var previousAuth = _currentTenant.IsAuthenticated;
        var previousUserId = _currentTenant.UserId;
        var previousTenantId = _currentTenant.TenantId;
        try
        {
            // Login/callback may run without a cookie session; seed a transient context for audit.
            _currentTenant.IsAuthenticated = true;
            _currentTenant.UserId = userId ?? previousUserId ?? Guid.Parse("00000000-0000-0000-0000-0000000000a1");
            _currentTenant.TenantId = tenantId is Guid t && t != Guid.Empty
                ? t
                : (previousTenantId != Guid.Empty
                    ? previousTenantId
                    : Guid.Parse("11111111-1111-1111-1111-111111111101"));

            await _audit.WriteAsync(eventType, metadata: metadata, cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "External auth audit write skipped for {EventType}", eventType);
        }
        finally
        {
            _currentTenant.IsAuthenticated = previousAuth;
            _currentTenant.UserId = previousUserId;
            _currentTenant.TenantId = previousTenantId;
        }
    }

    private static string DomainOf(string email)
    {
        var at = email.IndexOf('@');
        return at > 0 && at < email.Length - 1 ? email[(at + 1)..] : "unknown";
    }

    private static List<Claim> BuildSessionClaims(
        IReadOnlyList<string> roles,
        IReadOnlyCollection<string> permissions,
        IList<Claim> existingClaims)
    {
        var claims = new List<Claim>();

        var phClaim = existingClaims.FirstOrDefault(c => c.Type == "property_horizontal_id");
        if (phClaim is not null && !string.IsNullOrWhiteSpace(phClaim.Value))
        {
            claims.Add(new Claim("property_horizontal_id", phClaim.Value));
        }

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        foreach (var permission in permissions)
        {
            claims.Add(new Claim("permission", permission));
        }

        return claims;
    }
}
