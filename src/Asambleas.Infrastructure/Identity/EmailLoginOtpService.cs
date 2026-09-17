namespace Asambleas.Infrastructure.Identity;

using System.Security.Cryptography;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Contracts.Auth;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

/// <summary>
/// Passwordless email OTP login for convocated owners (and invited owners).
/// Codes are hashed; responses never reveal whether the email exists.
/// </summary>
public sealed class EmailLoginOtpService
{
    public static readonly TimeSpan CodeTtl = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);
    public const int MaxAttempts = 5;
    public const int MaxRequestsPerEmailPerHour = 8;

    private static readonly string GenericAccepted =
        "Si hay una convocatoria o invitación activa para ese correo, enviamos un código de 6 dígitos. Revisa tu bandeja y spam.";

    private readonly IAsambleasDbContext _db;
    private readonly IOwnerPortalIdentityService _identity;
    private readonly CommunicationConfigurationService _communications;
    private readonly AssemblyAccessLinkService _accessLinks;
    private readonly IEmailProvider _mockEmail;
    private readonly ExternalAuthService _externalAuth;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IAuditService _audit;
    private readonly CurrentTenant _currentTenant;
    private readonly IConfiguration _configuration;
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<EmailLoginOtpService> _logger;

    public EmailLoginOtpService(
        IAsambleasDbContext db,
        IOwnerPortalIdentityService identity,
        CommunicationConfigurationService communications,
        AssemblyAccessLinkService accessLinks,
        IEmailProvider mockEmail,
        ExternalAuthService externalAuth,
        UserManager<ApplicationUser> userManager,
        IAuditService audit,
        CurrentTenant currentTenant,
        IConfiguration configuration,
        IHttpContextAccessor http,
        ILogger<EmailLoginOtpService> logger)
    {
        _db = db;
        _identity = identity;
        _communications = communications;
        _accessLinks = accessLinks;
        _mockEmail = mockEmail;
        _externalAuth = externalAuth;
        _userManager = userManager;
        _audit = audit;
        _currentTenant = currentTenant;
        _configuration = configuration;
        _http = http;
        _logger = logger;
    }

    public static string? SuggestProvider(string email)
    {
        var at = email.IndexOf('@');
        if (at < 0 || at >= email.Length - 1) return null;
        var domain = email[(at + 1)..].ToLowerInvariant();
        if (domain is "gmail.com" or "googlemail.com") return ExternalAuthService.Google;
        if (domain is "outlook.com" or "hotmail.com" or "live.com" or "msn.com"
            || domain.EndsWith(".onmicrosoft.com", StringComparison.Ordinal))
        {
            return ExternalAuthService.Microsoft;
        }

        return null;
    }

    public async Task<EmailOtpRequestResponse> RequestAsync(
        string? email,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        var suggested = !string.IsNullOrWhiteSpace(email) ? SuggestProvider(email.Trim()) : null;
        var resendAt = DateTimeOffset.UtcNow.Add(ResendCooldown);
        var generic = new EmailOtpRequestResponse(true, GenericAccepted, resendAt, suggested);

        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@', StringComparison.Ordinal))
        {
            return generic;
        }

        var normalized = email.Trim().ToLowerInvariant();
        var safeReturn = SafeReturnUrl.Normalize(returnUrl);
        var ipHash = HashOpaque(ClientIp());

        await WriteAuditAsync(
            AuditEventType.EmailOtpRequested,
            tenantId: null,
            userId: null,
            metadata: new { emailDomain = DomainOf(normalized), hasReturnUrl = safeReturn is not null },
            cancellationToken);

        var eligibility = await ResolveEligibilityAsync(normalized, cancellationToken);
        if (eligibility is null)
        {
            // Same timing-ish response; do not reveal absence.
            return generic;
        }

        var now = DateTimeOffset.UtcNow;
        var hourAgo = now.AddHours(-1);
        var recentCount = await _db.EmailLoginChallenges.IgnoreQueryFilters()
            .CountAsync(
                c => c.EmailNormalized == normalized && c.CreatedAtUtc >= hourAgo,
                cancellationToken);
        if (recentCount >= MaxRequestsPerEmailPerHour)
        {
            return generic;
        }

        var latest = await _db.EmailLoginChallenges.IgnoreQueryFilters()
            .Where(c => c.EmailNormalized == normalized && c.ConsumedAtUtc == null && c.ExpiresAtUtc > now)
            .OrderByDescending(c => c.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        if (latest is not null && latest.LastSentAtUtc.Add(ResendCooldown) > now)
        {
            return new EmailOtpRequestResponse(
                true,
                GenericAccepted,
                latest.LastSentAtUtc.Add(ResendCooldown),
                suggested);
        }

        // Invalidate previous active challenges for this email.
        var pending = await _db.EmailLoginChallenges.IgnoreQueryFilters()
            .Where(c => c.EmailNormalized == normalized && c.ConsumedAtUtc == null && c.ExpiresAtUtc > now)
            .ToListAsync(cancellationToken);
        foreach (var row in pending)
        {
            row.ExpiresAtUtc = now.AddSeconds(-1);
            row.UpdatedAtUtc = now;
        }

        var code = CreateSixDigitCode();
        var challenge = new EmailLoginChallenge
        {
            TenantId = eligibility.TenantId,
            PropertyHorizontalId = eligibility.PropertyHorizontalId,
            AssemblyId = eligibility.AssemblyId,
            EmailNormalized = normalized,
            CodeHash = HashCode(normalized, code),
            ExpiresAtUtc = now.Add(CodeTtl),
            AttemptCount = 0,
            LastSentAtUtc = now,
            ReturnUrl = safeReturn,
            RequestIpHash = ipHash
        };
        _db.EmailLoginChallenges.Add(challenge);
        await _db.SaveChangesAsync(cancellationToken);

        try
        {
            await SendCodeEmailAsync(eligibility, normalized, code, challenge.ExpiresAtUtc, cancellationToken);
            await WriteAuditAsync(
                AuditEventType.EmailOtpSent,
                eligibility.TenantId,
                null,
                metadata: new
                {
                    emailDomain = DomainOf(normalized),
                    assemblyId = eligibility.AssemblyId,
                    propertyHorizontalId = eligibility.PropertyHorizontalId,
                    challengeId = challenge.Id
                },
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Email OTP send failed for domain {Domain}", DomainOf(normalized));
            // Still return generic — no enumeration / no code leak.
        }

        return new EmailOtpRequestResponse(true, GenericAccepted, now.Add(ResendCooldown), suggested);
    }

    public async Task<EmailOtpVerifyResponse> VerifyAsync(
        string? email,
        string? code,
        string? returnUrl,
        CancellationToken cancellationToken = default)
    {
        const string invalidMsg = "El código no es válido o ya venció. Solicita uno nuevo.";
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code))
        {
            return Fail("INVALID_CODE", invalidMsg);
        }

        var normalized = email.Trim().ToLowerInvariant();
        var digits = new string(code.Where(char.IsDigit).ToArray());
        if (digits.Length != 6)
        {
            await WriteAuditAsync(
                AuditEventType.EmailOtpFailed,
                null,
                null,
                new { emailDomain = DomainOf(normalized), reason = "FORMAT" },
                cancellationToken);
            return Fail("INVALID_CODE", invalidMsg);
        }

        var now = DateTimeOffset.UtcNow;
        var challenge = await _db.EmailLoginChallenges.IgnoreQueryFilters()
            .Where(c => c.EmailNormalized == normalized && c.ConsumedAtUtc == null)
            .OrderByDescending(c => c.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (challenge is null || challenge.ExpiresAtUtc <= now)
        {
            await WriteAuditAsync(
                AuditEventType.EmailOtpFailed,
                challenge?.TenantId,
                null,
                new { emailDomain = DomainOf(normalized), reason = "EXPIRED_OR_MISSING" },
                cancellationToken);
            return Fail("INVALID_CODE", invalidMsg);
        }

        if (challenge.AttemptCount >= MaxAttempts)
        {
            challenge.ExpiresAtUtc = now.AddSeconds(-1);
            challenge.UpdatedAtUtc = now;
            await _db.SaveChangesAsync(cancellationToken);
            await WriteAuditAsync(
                AuditEventType.EmailOtpFailed,
                challenge.TenantId,
                null,
                new { emailDomain = DomainOf(normalized), reason = "MAX_ATTEMPTS" },
                cancellationToken);
            return Fail("TOO_MANY_ATTEMPTS", "Demasiados intentos. Solicita un código nuevo.");
        }

        var expected = HashCode(normalized, digits);
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(challenge.CodeHash)))
        {
            challenge.AttemptCount += 1;
            challenge.UpdatedAtUtc = now;
            if (challenge.AttemptCount >= MaxAttempts)
            {
                challenge.ExpiresAtUtc = now.AddSeconds(-1);
            }

            await _db.SaveChangesAsync(cancellationToken);
            await WriteAuditAsync(
                AuditEventType.EmailOtpFailed,
                challenge.TenantId,
                null,
                new { emailDomain = DomainOf(normalized), reason = "MISMATCH", attempts = challenge.AttemptCount },
                cancellationToken);
            return Fail(
                challenge.AttemptCount >= MaxAttempts ? "TOO_MANY_ATTEMPTS" : "INVALID_CODE",
                challenge.AttemptCount >= MaxAttempts
                    ? "Demasiados intentos. Solicita un código nuevo."
                    : invalidMsg);
        }

        // Re-check eligibility after successful code (invitation may have been revoked).
        var eligibility = await ResolveEligibilityAsync(normalized, cancellationToken);
        if (eligibility is null)
        {
            challenge.ExpiresAtUtc = now.AddSeconds(-1);
            challenge.UpdatedAtUtc = now;
            await _db.SaveChangesAsync(cancellationToken);
            await WriteAuditAsync(
                AuditEventType.EmailOtpFailed,
                challenge.TenantId,
                null,
                new { emailDomain = DomainOf(normalized), reason = "NO_LONGER_ELIGIBLE" },
                cancellationToken);
            return Fail(
                "NOT_AUTHORIZED",
                "No encontramos una invitación o convocatoria válida asociada con esta cuenta.");
        }

        if (eligibility.AssemblyCancelled)
        {
            return Fail("CANCELLED", "La asamblea fue cancelada.");
        }

        challenge.ConsumedAtUtc = now;
        challenge.UpdatedAtUtc = now;
        await _db.SaveChangesAsync(cancellationToken);

        var userId = await _identity.EnsureOwnerUserPasswordlessAsync(
            eligibility.TenantId,
            eligibility.OrganizationId,
            normalized,
            eligibility.DisplayName,
            cancellationToken);

        if (eligibility.OwnerId is Guid ownerId)
        {
            var owner = await _db.Owners.IgnoreQueryFilters()
                .FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken);
            if (owner is not null && owner.UserId != userId)
            {
                owner.UserId = userId;
                owner.UpdatedAtUtc = now;
                await _db.SaveChangesAsync(cancellationToken);
            }

            await _accessLinks.EnrollOwnerIntoOpenConvocationsAsync(
                ownerId,
                userId,
                eligibility.DisplayName,
                cancellationToken);
        }

        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new InvalidOperationException("Owner user missing after OTP provision.");

        await _externalAuth.SignInAsync(user, cancellationToken);

        await WriteAuditAsync(
            AuditEventType.EmailOtpVerified,
            eligibility.TenantId,
            userId,
            new
            {
                emailDomain = DomainOf(normalized),
                assemblyId = eligibility.AssemblyId,
                propertyHorizontalId = eligibility.PropertyHorizontalId,
                challengeId = challenge.Id
            },
            cancellationToken);

        var roles = new List<string> { Roles.Owner };
        var permissions = RolePermissionMap.GetPermissions(roles).ToList();
        var login = new LoginResponse(
            user.Id,
            user.DisplayName,
            user.Email ?? normalized,
            user.TenantId,
            "PLATFORM",
            roles,
            permissions);

        var candidate = SafeReturnUrl.Normalize(returnUrl) ?? SafeReturnUrl.Normalize(challenge.ReturnUrl);
        var ret = string.IsNullOrWhiteSpace(candidate)
            ? null
            : AssemblyAccessLinkService.PreferParticipantRoomOverLobby(candidate);
        if (string.IsNullOrWhiteSpace(ret) || ret is "/" or "/index.html")
        {
            if (eligibility.AssemblyId is Guid aid)
            {
                ret = AssemblyAccessLinkService.ResolveParticipantRoomRedirect(
                    eligibility.AssemblyStatus ?? AssemblyStatus.Scheduled,
                    aid);
            }
            else
            {
                ret = await _accessLinks.TryResolveOwnerLiveRedirectAsync(userId, cancellationToken)
                      ?? "/owner.html";
            }
        }

        return new EmailOtpVerifyResponse(true, null, "OK", ret, login);
    }

    private async Task<Eligibility?> ResolveEligibilityAsync(string email, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;

        // 1) Active / joinable assembly via convocation recipient.
        var liveStatuses = new[]
        {
            AssemblyStatus.Scheduled,
            AssemblyStatus.CheckIn,
            AssemblyStatus.InProgress,
            AssemblyStatus.Paused
        };

        var fromConvocation = await (
            from r in _db.ConvocationRecipients.IgnoreQueryFilters().AsNoTracking()
            join c in _db.Convocations.IgnoreQueryFilters().AsNoTracking() on r.ConvocationId equals c.Id
            join a in _db.Assemblies.IgnoreQueryFilters().AsNoTracking() on c.AssemblyId equals a.Id
            join property in _db.PropertyHorizontals.IgnoreQueryFilters().AsNoTracking() on a.PropertyHorizontalId equals property.Id
            where r.Email != null
                  && r.Email.ToLower() == email
                  && r.IsValid
            orderby a.ScheduledAtUtc descending
            select new
            {
                a.TenantId,
                a.PropertyHorizontalId,
                AssemblyId = a.Id,
                a.Status,
                a.Title,
                PhName = property.Name,
                OrgId = property.OrganizationId,
                r.OwnerId,
                r.DisplayName
            }).FirstOrDefaultAsync(cancellationToken);

        if (fromConvocation is not null)
        {
            if (fromConvocation.Status == AssemblyStatus.Cancelled)
            {
                return new Eligibility(
                    fromConvocation.TenantId,
                    fromConvocation.PropertyHorizontalId,
                    fromConvocation.OrgId,
                    fromConvocation.AssemblyId,
                    fromConvocation.OwnerId,
                    string.IsNullOrWhiteSpace(fromConvocation.DisplayName) ? email.Split('@')[0] : fromConvocation.DisplayName,
                    fromConvocation.PhName,
                    fromConvocation.Title,
                    AssemblyCancelled: true,
                    AssemblyStatus: AssemblyStatus.Cancelled);
            }

            if (liveStatuses.Contains(fromConvocation.Status)
                || fromConvocation.Status == AssemblyStatus.Completed)
            {
                var recipientIds = await _db.ConvocationRecipients.IgnoreQueryFilters().AsNoTracking()
                    .Where(r => r.Email != null && r.Email.ToLower() == email && r.IsValid)
                    .Select(r => r.Id)
                    .ToListAsync(cancellationToken);

                var links = await _db.AssemblyAccessLinks.IgnoreQueryFilters().AsNoTracking()
                    .Where(l => l.AssemblyId == fromConvocation.AssemblyId && recipientIds.Contains(l.RecipientId))
                    .ToListAsync(cancellationToken);

                if (links.Count > 0)
                {
                    var hasActive = links.Any(l => l.RevokedAtUtc is null && l.ExpiresAtUtc > now);
                    if (!hasActive)
                    {
                        return null;
                    }
                }

                return new Eligibility(
                    fromConvocation.TenantId,
                    fromConvocation.PropertyHorizontalId,
                    fromConvocation.OrgId,
                    fromConvocation.AssemblyId,
                    fromConvocation.OwnerId,
                    string.IsNullOrWhiteSpace(fromConvocation.DisplayName) ? email.Split('@')[0] : fromConvocation.DisplayName,
                    fromConvocation.PhName,
                    fromConvocation.Title,
                    AssemblyCancelled: false,
                    AssemblyStatus: fromConvocation.Status);
            }
        }

        // 2) Pending owner invitation.
        var invite = await (
            from i in _db.OwnerInvitations.IgnoreQueryFilters().AsNoTracking()
            join property in _db.PropertyHorizontals.IgnoreQueryFilters().AsNoTracking() on i.PropertyHorizontalId equals property.Id
            where i.Email.ToLower() == email
                  && i.ConsumedAtUtc == null
                  && i.ExpiresAtUtc > now
            orderby i.CreatedAtUtc descending
            select new { i.TenantId, i.PropertyHorizontalId, property.OrganizationId, PhName = property.Name, i.OwnerId })
            .FirstOrDefaultAsync(cancellationToken);

        if (invite is not null)
        {
            var ownerName = await _db.Owners.IgnoreQueryFilters().AsNoTracking()
                .Where(o => o.Id == invite.OwnerId)
                .Select(o => o.DisplayName)
                .FirstOrDefaultAsync(cancellationToken) ?? email.Split('@')[0];

            return new Eligibility(
                invite.TenantId,
                invite.PropertyHorizontalId,
                invite.OrganizationId,
                AssemblyId: null,
                invite.OwnerId,
                ownerName,
                invite.PhName,
                AssemblyTitle: "Invitación al portal",
                AssemblyCancelled: false,
                AssemblyStatus: null);
        }

        // 3) Active owner with ownership.
        var owner = await _db.Owners.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(
                o => o.Email.ToLower() == email && o.Status != OwnerLifecycleStatus.Inactive,
                cancellationToken);
        if (owner is null)
        {
            return null;
        }

        var phId = owner.RegisteredPropertyHorizontalId
            ?? await (
                from own in _db.Ownerships.IgnoreQueryFilters().AsNoTracking()
                join u in _db.Units.IgnoreQueryFilters().AsNoTracking() on own.UnitId equals u.Id
                where own.OwnerId == owner.Id && own.IsActive
                select (Guid?)u.PropertyHorizontalId).FirstOrDefaultAsync(cancellationToken);

        if (phId is null)
        {
            return null;
        }

        var phRow = await _db.PropertyHorizontals.IgnoreQueryFilters().AsNoTracking()
            .FirstAsync(p => p.Id == phId, cancellationToken);

        return new Eligibility(
            owner.TenantId,
            phRow.Id,
            phRow.OrganizationId,
            AssemblyId: null,
            owner.Id,
            owner.DisplayName,
            phRow.Name,
            AssemblyTitle: "Portal del propietario",
            AssemblyCancelled: false,
            AssemblyStatus: null);
    }

    private async Task SendCodeEmailAsync(
        Eligibility eligibility,
        string email,
        string code,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken)
    {
        IEmailProvider provider = _mockEmail;
        if (eligibility.PropertyHorizontalId is Guid phId)
        {
            var resolved = await _communications.TryResolvePhEmailProviderSystemAsync(phId, cancellationToken);
            if (resolved is not null)
            {
                provider = resolved.Value.Provider;
            }
        }

        var subject = $"Código de acceso — {eligibility.PropertyHorizontalName}";
        var body = $"""
            Hola{(string.IsNullOrWhiteSpace(eligibility.DisplayName) ? "" : $" {eligibility.DisplayName}")},

            Tu código temporal para ingresar a ASAMBLEAS es:

            {code}

            Propiedad: {eligibility.PropertyHorizontalName}
            Asamblea: {eligibility.AssemblyTitle}
            Vigencia: 10 minutos (hasta {expiresAt.UtcDateTime:HH:mm} UTC).

            No compartas este código. Si no solicitaste el acceso, ignora este mensaje.
            """;

        var result = await provider.SendAsync(
            new EmailMessage(
                To: email,
                ToDisplayName: eligibility.DisplayName,
                Subject: subject,
                HtmlBody: $"<pre style=\"font-family:sans-serif;font-size:16px\">{System.Net.WebUtility.HtmlEncode(body)}</pre>",
                TextBody: body,
                FromAddress: null,
                FromDisplayName: eligibility.PropertyHorizontalName,
                ReplyTo: null,
                Headers: null),
            cancellationToken);

        if (!result.Succeeded)
        {
            throw new InvalidOperationException(result.Detail ?? "SMTP send failed");
        }
    }

    private static EmailOtpVerifyResponse Fail(string code, string message) =>
        new(false, code, message, null, null);

    private static string CreateSixDigitCode()
    {
        var value = RandomNumberGenerator.GetInt32(0, 1_000_000);
        return value.ToString("D6");
    }

    private string HashCode(string email, string code)
    {
        var pepper = _configuration["Authentication:EmailOtp:Pepper"]
                     ?? _configuration["ASAMBLEAS_EMAIL_OTP_PEPPER"]
                     ?? "asambleas-email-otp-v1";
        return HashOpaque($"{pepper}:{email}:{code}");
    }

    private static string HashOpaque(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private string ClientIp()
    {
        var ctx = _http.HttpContext;
        if (ctx is null) return "unknown";
        return ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private static string DomainOf(string email)
    {
        var at = email.IndexOf('@');
        return at > 0 && at < email.Length - 1 ? email[(at + 1)..] : "unknown";
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
            _logger.LogWarning(ex, "Email OTP audit skipped for {EventType}", eventType);
        }
        finally
        {
            _currentTenant.IsAuthenticated = previousAuth;
            _currentTenant.UserId = previousUserId;
            _currentTenant.TenantId = previousTenantId;
        }
    }

    private sealed record Eligibility(
        Guid TenantId,
        Guid? PropertyHorizontalId,
        Guid? OrganizationId,
        Guid? AssemblyId,
        Guid? OwnerId,
        string DisplayName,
        string PropertyHorizontalName,
        string AssemblyTitle,
        bool AssemblyCancelled,
        AssemblyStatus? AssemblyStatus);
}
