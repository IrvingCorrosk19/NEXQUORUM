namespace Asambleas.Application.PhOnboarding;

using System.Security.Cryptography;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Common;
using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Contracts.PhOnboarding;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Secure owner portal invitations: single-use, short-lived tokens hashed at rest.
/// Emails go through Communication Center PH SMTP resolution (same as Email/test).
/// Never puts passwords in URLs or invitation payloads.
/// </summary>
public sealed class OwnerInvitationService
{
    public static readonly TimeSpan InvitationLifetime = TimeSpan.FromHours(48);

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IOwnerPortalIdentityService _identity;
    private readonly CommunicationConfigurationService _communications;
    private readonly IPortalNotificationProvider _portal;
    private readonly IAuditService _audit;
    private readonly IPublicBaseUrlProvider _publicBaseUrl;

    public OwnerInvitationService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IOwnerPortalIdentityService identity,
        CommunicationConfigurationService communications,
        IPortalNotificationProvider portal,
        IAuditService audit,
        IPublicBaseUrlProvider publicBaseUrl)
    {
        _db = db;
        _currentTenant = currentTenant;
        _identity = identity;
        _communications = communications;
        _portal = portal;
        _audit = audit;
        _publicBaseUrl = publicBaseUrl;
    }

    public async Task<InviteOwnerResultDto> InviteAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var actorId = TenantGuard.RequireUserId(_currentTenant);

        var ph = await _db.PropertyHorizontals.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == propertyHorizontalId, cancellationToken)
            ?? throw new DomainException("PH_NOT_FOUND", "Property horizontal not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, ph.TenantId);

        var owner = await _db.Owners.FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, owner.TenantId);
        await EnsureOwnerBelongsToPhAsync(propertyHorizontalId, ownerId, cancellationToken);

        if (string.IsNullOrWhiteSpace(owner.Email))
        {
            throw new DomainException("OWNER_EMAIL_REQUIRED", "Owner email is required to invite.");
        }

        var email = owner.Email.Trim().ToLowerInvariant();

        if (owner.UserId is Guid linkedUserId)
        {
            var activeMembership = await _db.UserPropertyMemberships.AsNoTracking().AnyAsync(
                m => m.UserId == linkedUserId
                     && m.PropertyHorizontalId == propertyHorizontalId
                     && m.IsActive,
                cancellationToken);
            if (activeMembership)
            {
                throw new DomainException(
                    "OWNER_ALREADY_ACTIVE",
                    "Este propietario ya tiene acceso activo a la plataforma en este PH.");
            }
        }

        // Resolve provider BEFORE creating invitation so we fail fast if SMTP is misconfigured.
        var (emailProvider, usedSandbox, providerName) =
            await _communications.ResolvePhEmailProviderAsync(propertyHorizontalId, cancellationToken);

        if (!usedSandbox && string.Equals(providerName, "Mock", StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainException(
                "COMMUNICATION_EMAIL_NOT_CONFIGURED",
                $"El correo electrónico todavía no está configurado para {ph.Name}. Abre Comunicaciones de este PH, configura Email/SMTP y desactiva Sandbox antes de invitar.");
        }

        await InvalidateOutstandingInvitationsAsync(propertyHorizontalId, owner.Id, cancellationToken);

        var existingUserId = await _identity.FindUserIdByEmailAsync(email, cancellationToken);
        var requiresLogin = existingUserId is not null;

        var rawToken = CreateOpaqueToken();
        var tokenHash = HashToken(rawToken);
        var expires = DateTimeOffset.UtcNow.Add(InvitationLifetime);

        var invitation = new OwnerInvitation
        {
            TenantId = _currentTenant.TenantId,
            PropertyHorizontalId = propertyHorizontalId,
            OwnerId = owner.Id,
            Email = email,
            TokenHash = tokenHash,
            ExpiresAtUtc = expires,
            CreatedByUserId = actorId
        };
        _db.OwnerInvitations.Add(invitation);

        var previousStatus = owner.Status;
        if (owner.Status is OwnerLifecycleStatus.Draft or OwnerLifecycleStatus.Inactive)
        {
            owner.Status = OwnerLifecycleStatus.Invited;
        }

        await _db.SaveChangesAsync(cancellationToken);

        var activationPath = $"/activate.html?token={Uri.EscapeDataString(rawToken)}";
        var activationUrl = _publicBaseUrl.BuildAbsoluteUrl(activationPath);

        ProviderSendResult sendResult;
        try
        {
            sendResult = await SendInvitationEmailAsync(
                emailProvider,
                ph.Name,
                owner.DisplayName,
                email,
                activationUrl,
                requiresLogin,
                expires,
                cancellationToken);
        }
        catch (Exception ex) when (ex is not DomainException)
        {
            await FailInvitationAsync(invitation, owner, previousStatus, cancellationToken);
            throw new DomainException(
                "INVITATION_EMAIL_FAILED",
                "No pudimos enviar la invitación. Revisa la configuración SMTP e inténtalo de nuevo.",
                ex);
        }

        if (!sendResult.Succeeded)
        {
            await FailInvitationAsync(invitation, owner, previousStatus, cancellationToken);
            throw new DomainException(
                "INVITATION_EMAIL_FAILED",
                MapSendFailure(sendResult.Detail));
        }

        if (requiresLogin && existingUserId is Guid notifyUserId)
        {
            await _portal.SendAsync(
                new PortalMessage(
                    ph.TenantId,
                    propertyHorizontalId,
                    notifyUserId,
                    owner.Id,
                    null,
                    null,
                    "Nueva propiedad en ASAMBLEAS",
                    $"Te invitaron a {ph.Name}. Inicia sesión y acepta la invitación para vincular el acceso."),
                cancellationToken);
        }

        await _audit.WriteAsync(
            AuditEventType.OwnerInvitationSent,
            correlationId: invitation.Id,
            metadata: new
            {
                propertyHorizontalId,
                ownerId = owner.Id,
                emailMasked = MaskEmail(email),
                requiresLogin,
                provider = providerName,
                usedSandbox,
                providerMessageId = sendResult.ProviderMessageId,
                actorId
            },
            cancellationToken: cancellationToken);

        // Never return raw activation token/path to the admin UI.
        return new InviteOwnerResultDto(
            invitation.Id,
            MaskEmail(email),
            expires,
            ExistingUserLinked: false,
            RequiresLoginToAccept: requiresLogin,
            EmailSent: true,
            Provider: providerName,
            UsedSandbox: usedSandbox,
            Detail: sendResult.Detail);
    }

    public async Task RevokeOutstandingAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var actorId = TenantGuard.RequireUserId(_currentTenant);
        await EnsureOwnerBelongsToPhAsync(propertyHorizontalId, ownerId, cancellationToken);

        var count = await InvalidateOutstandingInvitationsAsync(propertyHorizontalId, ownerId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.OwnerInvitationRevoked,
            correlationId: ownerId,
            metadata: new { propertyHorizontalId, ownerId, revokedCount = count, actorId },
            cancellationToken: cancellationToken);
    }

    public async Task ActivateAsync(
        ActivateInvitationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new DomainException("INVITE_TOKEN_REQUIRED", "Activation token is required.");
        }

        var invitation = await LoadValidInvitationAsync(request.Token, cancellationToken);
        var existingUserId = await _identity.FindUserIdByEmailAsync(invitation.Email, cancellationToken);
        if (existingUserId is not null)
        {
            throw new DomainException(
                "INVITE_REQUIRES_LOGIN",
                "Ya existe una cuenta con este correo. Inicia sesión para aceptar la invitación.");
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 12)
        {
            throw new DomainException(
                "PASSWORD_WEAK",
                "La contraseña debe tener al menos 12 caracteres, una mayúscula, una minúscula, un número y un símbolo (ej. ! @ # $).");
        }

        EnsurePasswordMeetsPolicy(request.Password);

        var owner = await _db.Owners.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Id == invitation.OwnerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");

        var ph = await _db.PropertyHorizontals.IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Id == invitation.PropertyHorizontalId, cancellationToken)
            ?? throw new DomainException("PH_NOT_FOUND", "Property horizontal not found.");

        var displayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? owner.DisplayName
            : request.DisplayName.Trim();

        var userId = await _identity.EnsureOwnerUserAsync(
            invitation.TenantId,
            ph.OrganizationId,
            invitation.Email,
            displayName,
            request.Password,
            cancellationToken);

        await CompleteLinkAsync(invitation, owner, userId, displayName, cancellationToken);
    }

    public async Task AcceptAuthenticatedAsync(
        AcceptInvitationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new DomainException("INVITE_TOKEN_REQUIRED", "Activation token is required.");
        }

        var invitation = await LoadValidInvitationAsync(request.Token, cancellationToken);
        var userEmail = await _identity.GetEmailByUserIdAsync(userId, cancellationToken)
            ?? throw new DomainException("USER_EMAIL_MISSING", "La cuenta autenticada no tiene correo.");

        if (!string.Equals(userEmail.Trim(), invitation.Email, StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainException(
                "INVITE_EMAIL_MISMATCH",
                "La sesión actual no corresponde al correo de la invitación.");
        }

        var owner = await _db.Owners.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Id == invitation.OwnerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");

        await _identity.LinkOwnerRoleAsync(userId, cancellationToken);
        await CompleteLinkAsync(invitation, owner, userId, owner.DisplayName, cancellationToken);
    }

    public async Task<InvitationPreviewDto> PreviewTokenAsync(
        string token,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new DomainException("INVITE_TOKEN_REQUIRED", "Activation token is required.");
        }

        try
        {
            var invitation = await LoadValidInvitationAsync(token, cancellationToken);
            var owner = await _db.Owners.IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == invitation.OwnerId, cancellationToken);
            var ph = await _db.PropertyHorizontals.IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == invitation.PropertyHorizontalId, cancellationToken);
            var existing = await _identity.FindUserIdByEmailAsync(invitation.Email, cancellationToken) is not null;
            return new InvitationPreviewDto(
                invitation.Email,
                owner?.DisplayName ?? invitation.Email,
                ph?.Name ?? "Propiedad",
                invitation.ExpiresAtUtc,
                existing);
        }
        catch (DomainException ex) when (ex.Code is "INVITE_EXPIRED")
        {
            return new InvitationPreviewDto(
                string.Empty,
                string.Empty,
                string.Empty,
                DateTimeOffset.UtcNow,
                false,
                IsExpired: true,
                ErrorCode: ex.Code,
                ErrorMessage: "Esta invitación ha expirado. Solicita una nueva al administrador.");
        }
        catch (DomainException ex) when (ex.Code is "INVITE_CONSUMED" or "INVITE_INVALID" or "INVITE_REVOKED")
        {
            return new InvitationPreviewDto(
                string.Empty,
                string.Empty,
                string.Empty,
                DateTimeOffset.UtcNow,
                false,
                IsExpired: false,
                ErrorCode: ex.Code,
                ErrorMessage: ex.Code == "INVITE_CONSUMED"
                    ? "Esta invitación ya fue utilizada."
                    : "Enlace de activación inválido. Solicita una nueva invitación.");
        }
    }

    private async Task FailInvitationAsync(
        OwnerInvitation invitation,
        Owner owner,
        OwnerLifecycleStatus previousStatus,
        CancellationToken cancellationToken)
    {
        // Do not leave a false "InvitationPending/Sent" trail when SMTP rejected the message.
        _db.OwnerInvitations.Remove(invitation);
        owner.Status = previousStatus;
        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "OWNER_INVITATION_FAILED",
            correlationId: invitation.Id,
            metadata: new { invitation.OwnerId, invitation.PropertyHorizontalId, emailMasked = MaskEmail(invitation.Email) },
            cancellationToken: cancellationToken);
    }

    private async Task CompleteLinkAsync(
        OwnerInvitation invitation,
        Owner owner,
        Guid userId,
        string displayName,
        CancellationToken cancellationToken)
    {
        owner.UserId = userId;
        owner.Status = OwnerLifecycleStatus.Active;
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            owner.DisplayName = displayName;
        }

        invitation.ConsumedAtUtc = DateTimeOffset.UtcNow;
        invitation.ConsumedByUserId = userId;

        await EnsureMembershipAsync(
            invitation.TenantId,
            userId,
            invitation.PropertyHorizontalId,
            Roles.Owner,
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteSystemAsync(
            invitation.TenantId,
            AuditEventType.OwnerInvitationAccepted,
            propertyHorizontalId: invitation.PropertyHorizontalId,
            correlationId: invitation.Id,
            userId: userId,
            metadata: new { invitation.PropertyHorizontalId, ownerId = owner.Id, userId },
            cancellationToken: cancellationToken);

        await _audit.WriteSystemAsync(
            invitation.TenantId,
            AuditEventType.OwnerUserLinked,
            propertyHorizontalId: invitation.PropertyHorizontalId,
            correlationId: owner.Id,
            userId: userId,
            metadata: new { invitation.PropertyHorizontalId, userId },
            cancellationToken: cancellationToken);
    }

    private async Task<OwnerInvitation> LoadValidInvitationAsync(string rawToken, CancellationToken cancellationToken)
    {
        var hash = HashToken(rawToken.Trim());
        var invitation = await _db.OwnerInvitations
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(i => i.TokenHash == hash, cancellationToken)
            ?? throw new DomainException("INVITE_INVALID", "Invitation is invalid or expired.");

        if (invitation.ConsumedAtUtc is not null)
        {
            throw new DomainException("INVITE_CONSUMED", "This invitation was already used.");
        }

        if (invitation.ExpiresAtUtc < DateTimeOffset.UtcNow)
        {
            throw new DomainException("INVITE_EXPIRED", "This invitation has expired.");
        }

        return invitation;
    }

    private async Task EnsureOwnerBelongsToPhAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken)
    {
        var inPh = await (
            from own in _db.Ownerships.AsNoTracking()
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where own.OwnerId == ownerId && u.PropertyHorizontalId == propertyHorizontalId
            select own.Id).AnyAsync(cancellationToken);

        if (inPh)
        {
            return;
        }

        var registered = await _db.Owners.AsNoTracking().AnyAsync(
            o => o.Id == ownerId && o.RegisteredPropertyHorizontalId == propertyHorizontalId,
            cancellationToken);
        if (!registered)
        {
            throw new DomainException("OWNER_NOT_IN_PH", "Owner does not belong to this property horizontal.");
        }
    }

    private async Task<int> InvalidateOutstandingInvitationsAsync(
        Guid propertyHorizontalId,
        Guid ownerId,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var pending = await _db.OwnerInvitations
            .Where(i =>
                i.PropertyHorizontalId == propertyHorizontalId
                && i.OwnerId == ownerId
                && i.ConsumedAtUtc == null
                && i.ExpiresAtUtc > now)
            .ToListAsync(cancellationToken);

        foreach (var row in pending)
        {
            row.ExpiresAtUtc = now.AddSeconds(-1);
        }

        return pending.Count;
    }

    private static async Task<ProviderSendResult> SendInvitationEmailAsync(
        IEmailProvider emailProvider,
        string phName,
        string ownerName,
        string email,
        string activationUrl,
        bool requiresLogin,
        DateTimeOffset expires,
        CancellationToken cancellationToken)
    {
        var subject = $"Invitación a ASAMBLEAS — {phName}";
        var safeName = System.Net.WebUtility.HtmlEncode(ownerName);
        var safePh = System.Net.WebUtility.HtmlEncode(phName);
        var safeUrl = System.Net.WebUtility.HtmlEncode(activationUrl);
        var expiresLabel = expires.ToString("dd MMM yyyy HH:mm") + " UTC";

        string text;
        string html;
        if (requiresLogin)
        {
            text =
                $"Hola {ownerName},\n\n{phName} te ha invitado a ASAMBLEAS.\n" +
                $"Ya tienes una cuenta. Inicia sesión y abre este enlace para aceptar:\n{activationUrl}\n\n" +
                $"Vence: {expiresLabel}\n\nNunca enviamos contraseñas por correo.";
            html = BuildInviteHtml(
                safeName,
                safePh,
                safeUrl,
                expiresLabel,
                ctaLabel: "Aceptar acceso",
                intro: "Ya tienes una cuenta en ASAMBLEAS. Inicia sesión y acepta esta invitación para vincular el acceso.");
        }
        else
        {
            text =
                $"Hola {ownerName},\n\n{phName} te ha invitado a acceder a ASAMBLEAS.\n" +
                $"Activa tu cuenta aquí (un solo uso):\n{activationUrl}\n\n" +
                $"Vence: {expiresLabel}\n\nNunca compartimos tu contraseña por correo. Tú la defines al activar.";
            html = BuildInviteHtml(
                safeName,
                safePh,
                safeUrl,
                expiresLabel,
                ctaLabel: "Activar mi cuenta",
                intro: "Desde tu cuenta podrás consultar tus asambleas y participar según las reglas de la propiedad.");
        }

        return await emailProvider.SendAsync(
            new EmailMessage(email, ownerName, subject, html, text, null, null, null, null),
            cancellationToken);
    }

    private static string BuildInviteHtml(
        string safeOwnerName,
        string safePhName,
        string safeActivationUrl,
        string expiresLabel,
        string ctaLabel,
        string intro) =>
        $"""
        <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">
          <p style="letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:#666">ASAMBLEAS</p>
          <h1 style="font-size:22px;margin:0 0 12px">Has sido invitado</h1>
          <p>Hola {safeOwnerName},</p>
          <p><strong>{safePhName}</strong> te ha invitado a acceder a la plataforma ASAMBLEAS.</p>
          <p>{System.Net.WebUtility.HtmlEncode(intro)}</p>
          <p style="margin:28px 0">
            <a href="{safeActivationUrl}"
               style="display:inline-block;background:#0f3d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">
              {System.Net.WebUtility.HtmlEncode(ctaLabel)}
            </a>
          </p>
          <p style="font-size:13px;color:#555">Esta invitación vence: {System.Net.WebUtility.HtmlEncode(expiresLabel)}</p>
          <p style="font-size:12px;color:#777">Si no esperabas esta invitación, puedes ignorar este mensaje.</p>
        </div>
        """;

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 1)
        {
            return "***";
        }

        var local = email[..at];
        var domain = email[(at + 1)..];
        var visible = Math.Min(3, local.Length);
        return $"{local[..visible]}******@{domain}";
    }

    private static string MapSendFailure(string? detail)
    {
        var d = detail ?? string.Empty;
        if (d.Contains("AUTHENTICATION_FAILED", StringComparison.OrdinalIgnoreCase))
        {
            return "No pudimos autenticar la cuenta de correo. Verifica la contraseña de aplicación.";
        }

        if (d.Contains("CONNECTION_TIMEOUT", StringComparison.OrdinalIgnoreCase))
        {
            return "No pudimos conectar con el servidor SMTP.";
        }

        if (d.Contains("TLS_FAILED", StringComparison.OrdinalIgnoreCase))
        {
            return "No fue posible establecer una conexión segura con SMTP.";
        }

        return "No pudimos enviar la invitación. Revisa Comunicaciones → Email/SMTP e inténtalo de nuevo.";
    }

    private async Task EnsureMembershipAsync(
        Guid tenantId,
        Guid userId,
        Guid propertyHorizontalId,
        string roleHint,
        CancellationToken cancellationToken)
    {
        var existing = await _db.UserPropertyMemberships.IgnoreQueryFilters().FirstOrDefaultAsync(
            m => m.UserId == userId && m.PropertyHorizontalId == propertyHorizontalId, cancellationToken);
        if (existing is null)
        {
            _db.UserPropertyMemberships.Add(new UserPropertyMembership
            {
                TenantId = tenantId,
                UserId = userId,
                PropertyHorizontalId = propertyHorizontalId,
                RoleHint = roleHint,
                IsActive = true
            });
        }
        else
        {
            existing.IsActive = true;
            existing.RoleHint = roleHint;
        }
    }

    private static void EnsurePasswordMeetsPolicy(string password)
    {
        var hasUpper = password.Any(char.IsUpper);
        var hasLower = password.Any(char.IsLower);
        var hasDigit = password.Any(char.IsDigit);
        var hasSymbol = password.Any(ch => !char.IsLetterOrDigit(ch));
        if (password.Length < 12 || !hasUpper || !hasLower || !hasDigit || !hasSymbol)
        {
            throw new DomainException(
                "PASSWORD_WEAK",
                "La contraseña debe tener al menos 12 caracteres, una mayúscula, una minúscula, un número y un símbolo (ej. ! @ # $).");
        }
    }

    private static string CreateOpaqueToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes);
    }
}
