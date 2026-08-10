namespace Asambleas.Application.PhOnboarding;

using System.Security.Cryptography;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.PhOnboarding;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Secure owner portal invitations: single-use, short-lived tokens hashed at rest.
/// Never puts passwords in URLs or invitation payloads.
/// </summary>
public sealed class OwnerInvitationService
{
    private static readonly TimeSpan InvitationLifetime = TimeSpan.FromHours(48);

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IOwnerPortalIdentityService _identity;
    private readonly IEmailProvider _email;
    private readonly IPortalNotificationProvider _portal;
    private readonly IAuditService _audit;

    public OwnerInvitationService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IOwnerPortalIdentityService identity,
        IEmailProvider email,
        IPortalNotificationProvider portal,
        IAuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _identity = identity;
        _email = email;
        _portal = portal;
        _audit = audit;
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

        if (string.IsNullOrWhiteSpace(owner.Email))
        {
            throw new DomainException("OWNER_EMAIL_REQUIRED", "Owner email is required to invite.");
        }

        var email = owner.Email.Trim().ToLowerInvariant();
        var existingUserId = await _identity.FindUserIdByEmailAsync(email, cancellationToken);
        var existingLinked = false;

        if (existingUserId is Guid userId)
        {
            existingLinked = true;
            owner.UserId = userId;
            await _identity.LinkOwnerRoleAsync(userId, cancellationToken);
            await EnsureMembershipAsync(ph.TenantId, userId, propertyHorizontalId, Roles.Owner, cancellationToken);
            owner.Status = OwnerLifecycleStatus.Active;
            await _db.SaveChangesAsync(cancellationToken);

            await _portal.SendAsync(
                new PortalMessage(
                    ph.TenantId,
                    propertyHorizontalId,
                    userId,
                    owner.Id,
                    null,
                    null,
                    "Acceso al portal",
                    $"Tu cuenta ya está vinculada a {ph.Name}. Inicia sesión para continuar."),
                cancellationToken);

            await _audit.WriteAsync(
                "ph.owner.invite.linked_existing",
                correlationId: owner.Id,
                metadata: new { propertyHorizontalId, email },
                cancellationToken: cancellationToken);

            return new InviteOwnerResultDto(
                Guid.Empty,
                email,
                DateTimeOffset.UtcNow,
                "/",
                ExistingUserLinked: true);
        }

        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
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

        owner.Status = OwnerLifecycleStatus.Invited;
        await _db.SaveChangesAsync(cancellationToken);

        var activationPath = $"/activate.html?token={Uri.EscapeDataString(rawToken)}";
        var subject = $"Invitación al portal — {ph.Name}";
        var text =
            $"Hola {owner.DisplayName},\n\nHas sido invitado a ASAMBLEAS para {ph.Name}.\n" +
            $"Activa tu acceso aquí (enlace de un solo uso, vence en 48h):\n{activationPath}\n\n" +
            "Nunca compartimos tu contraseña por correo. Tú la defines al activar.";
        var html =
            $"<p>Hola {System.Net.WebUtility.HtmlEncode(owner.DisplayName)},</p>" +
            $"<p>Has sido invitado a ASAMBLEAS para <strong>{System.Net.WebUtility.HtmlEncode(ph.Name)}</strong>.</p>" +
            $"<p><a href=\"{activationPath}\">Activar acceso</a> (un solo uso, vence en 48h).</p>" +
            "<p>Nunca compartimos tu contraseña por correo. Tú la defines al activar.</p>";
        await _email.SendAsync(
            new EmailMessage(email, owner.DisplayName, subject, html, text, null, null, null, null),
            cancellationToken);

        await _audit.WriteAsync(
            "InvitationSent",
            correlationId: invitation.Id,
            metadata: new { propertyHorizontalId, owner.Id, email },
            cancellationToken: cancellationToken);

        return new InviteOwnerResultDto(
            invitation.Id,
            email,
            expires,
            activationPath,
            ExistingUserLinked: existingLinked);
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

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 12)
        {
            throw new DomainException("PASSWORD_WEAK", "Password must be at least 12 characters.");
        }

        var hash = HashToken(request.Token.Trim());
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

        var owner = await _db.Owners.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.Id == invitation.OwnerId, cancellationToken)
            ?? throw new DomainException("OWNER_NOT_FOUND", "Owner not found.");

        var ph = await _db.PropertyHorizontals.IgnoreQueryFilters()
            .FirstOrDefaultAsync(p => p.Id == invitation.PropertyHorizontalId, cancellationToken)
            ?? throw new DomainException("PH_NOT_FOUND", "Property horizontal not found.");

        var displayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? owner.DisplayName
            : request.DisplayName.Trim();

        var existingUserId = await _identity.FindUserIdByEmailAsync(invitation.Email, cancellationToken);
        Guid userId;
        if (existingUserId is Guid existing)
        {
            userId = existing;
            await _identity.LinkOwnerRoleAsync(userId, cancellationToken);
        }
        else
        {
            userId = await _identity.EnsureOwnerUserAsync(
                invitation.TenantId,
                ph.OrganizationId,
                invitation.Email,
                displayName,
                request.Password,
                cancellationToken);
        }

        owner.UserId = userId;
        owner.Status = OwnerLifecycleStatus.Active;
        if (!string.IsNullOrWhiteSpace(request.DisplayName))
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

        await _audit.WriteAsync(
            "ph.owner.invite.activated",
            correlationId: invitation.Id,
            metadata: new { invitation.PropertyHorizontalId, owner.Id, userId },
            cancellationToken: cancellationToken);
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
        else if (!existing.IsActive)
        {
            existing.IsActive = true;
            existing.RoleHint = roleHint;
        }
    }

    private static string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes);
    }
}
