namespace Asambleas.Application.PhOnboarding;

using System.Security.Cryptography;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Common;
using Asambleas.Application.Communications;
using Asambleas.Contracts.Auth;
using Asambleas.Contracts.PhOnboarding;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Owner password reset: single-use hashed tokens; never emails the password itself.
/// </summary>
public sealed class OwnerPasswordResetService
{
    public static readonly TimeSpan ResetLifetime = TimeSpan.FromHours(2);

    private static readonly string GenericAcceptedDetail =
        "Si existe una cuenta activa con ese correo, enviamos un enlace para restablecer la contraseña. Revisa tu bandeja y spam.";

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IOwnerPortalIdentityService _identity;
    private readonly CommunicationConfigurationService _communications;
    private readonly IAuditService _audit;
    private readonly IPublicBaseUrlProvider _publicBaseUrl;

    public OwnerPasswordResetService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IOwnerPortalIdentityService identity,
        CommunicationConfigurationService communications,
        IAuditService audit,
        IPublicBaseUrlProvider publicBaseUrl)
    {
        _db = db;
        _currentTenant = currentTenant;
        _identity = identity;
        _communications = communications;
        _audit = audit;
        _publicBaseUrl = publicBaseUrl;
    }

    public async Task<OwnerPasswordResetRequestResultDto> RequestByAdminAsync(
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
            throw new DomainException("OWNER_EMAIL_REQUIRED", "El propietario necesita un correo para restablecer la contraseña.");
        }

        var email = owner.Email.Trim().ToLowerInvariant();

        // Heal stale Owner.UserId when the login account for this email differs from the linked seed user.
        var loginUserId = await _identity.FindUserIdByEmailAsync(email, cancellationToken);
        if (loginUserId is Guid linkedLoginId && owner.UserId != linkedLoginId)
        {
            owner.UserId = linkedLoginId;
            owner.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

        if (owner.UserId is not Guid userId)
        {
            throw new DomainException(
                "OWNER_NOT_ACTIVE",
                "Este propietario aún no tiene cuenta activa. Envía una invitación primero.");
        }

        var membershipActive = await _db.UserPropertyMemberships.AsNoTracking().AnyAsync(
            m => m.UserId == userId
                 && m.PropertyHorizontalId == propertyHorizontalId
                 && m.IsActive,
            cancellationToken);
        if (!membershipActive)
        {
            throw new DomainException(
                "OWNER_NOT_ACTIVE",
                "Este propietario no tiene acceso activo en este PH.");
        }

        var (emailProvider, usedSandbox, providerName) =
            await _communications.ResolvePhEmailProviderAsync(propertyHorizontalId, cancellationToken);

        if (!usedSandbox
            && string.Equals(providerName, "Mock", StringComparison.OrdinalIgnoreCase)
            && !_communications.AllowsMockInvitations)
        {
            throw new DomainException(
                "COMMUNICATION_EMAIL_NOT_CONFIGURED",
                $"El correo electrónico todavía no está configurado para {ph.Name}. Abre Comunicaciones de este PH, configura Email/SMTP y desactiva Sandbox.");
        }

        var reset = await CreateResetAsync(
            ph.TenantId,
            propertyHorizontalId,
            owner.Id,
            userId,
            email,
            actorId,
            cancellationToken);

        var resetPath = $"/go/reset-password/{Uri.EscapeDataString(reset.RawToken)}";
        var resetUrl = _publicBaseUrl.BuildAbsoluteUrl(resetPath);

        ProviderSendResult sendResult;
        try
        {
            sendResult = await SendResetEmailAsync(
                emailProvider,
                ph.Name,
                owner.DisplayName,
                email,
                resetUrl,
                reset.Entity.ExpiresAtUtc,
                cancellationToken);
        }
        catch (Exception ex) when (ex is not DomainException)
        {
            throw new DomainException(
                "RESET_EMAIL_FAILED",
                "No pudimos enviar el correo de restablecimiento. Revisa la configuración SMTP e inténtalo de nuevo.",
                ex);
        }

        if (!sendResult.Succeeded)
        {
            throw new DomainException("RESET_EMAIL_FAILED", MapSendFailure(sendResult.Detail));
        }

        await _audit.WriteAsync(
            AuditEventType.OwnerPasswordResetRequested,
            correlationId: reset.Entity.Id,
            metadata: new
            {
                propertyHorizontalId,
                ownerId = owner.Id,
                userId,
                emailMasked = MaskEmail(email),
                provider = providerName,
                usedSandbox,
                providerMessageId = sendResult.ProviderMessageId,
                actorId,
                source = "admin"
            },
            cancellationToken: cancellationToken);

        return new OwnerPasswordResetRequestResultDto(
            reset.Entity.Id,
            MaskEmail(email),
            reset.Entity.ExpiresAtUtc,
            EmailSent: true,
            providerName,
            usedSandbox,
            sendResult.Detail);
    }

    public async Task<ForgotPasswordResponse> RequestByEmailAsync(
        string? email,
        CancellationToken cancellationToken = default)
    {
        var response = new ForgotPasswordResponse(true, GenericAcceptedDetail);
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
        {
            return response;
        }

        var normalized = email.Trim().ToLowerInvariant();
        try
        {
            var userId = await _identity.FindUserIdByEmailAsync(normalized, cancellationToken);
            if (userId is null)
            {
                return response;
            }

            // Prefer owner linked to this login user; fall back by email (heals stale UserId links).
            var owner = await _db.Owners.IgnoreQueryFilters()
                .FirstOrDefaultAsync(o => o.UserId == userId, cancellationToken);
            if (owner is null)
            {
                owner = await _db.Owners.IgnoreQueryFilters()
                    .Where(o => o.Email != null && o.Email.ToLower() == normalized)
                    .OrderByDescending(o => o.UpdatedAtUtc)
                    .FirstOrDefaultAsync(cancellationToken);
            }

            if (owner is null)
            {
                return response;
            }

            if (owner.UserId != userId)
            {
                owner.UserId = userId;
                owner.UpdatedAtUtc = DateTimeOffset.UtcNow;
                await _db.SaveChangesAsync(cancellationToken);
            }

            var membership = await _db.UserPropertyMemberships.IgnoreQueryFilters()
                .AsNoTracking()
                .Where(m => m.UserId == userId.Value && m.IsActive)
                .OrderByDescending(m => m.UpdatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);

            if (membership is null)
            {
                return response;
            }

            var ph = await _db.PropertyHorizontals.IgnoreQueryFilters()
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == membership.PropertyHorizontalId, cancellationToken);
            if (ph is null)
            {
                return response;
            }

            var resolved = await _communications.TryResolvePhEmailProviderSystemAsync(
                membership.PropertyHorizontalId,
                cancellationToken);
            if (resolved is null)
            {
                return response;
            }

            var (emailProvider, usedSandbox, providerName) = resolved.Value;
            if (!usedSandbox
                && string.Equals(providerName, "Mock", StringComparison.OrdinalIgnoreCase)
                && !_communications.AllowsMockInvitations)
            {
                return response;
            }

            var reset = await CreateResetAsync(
                ph.TenantId,
                membership.PropertyHorizontalId,
                owner.Id,
                userId.Value,
                normalized,
                createdByUserId: null,
                cancellationToken);

            var resetPath = $"/go/reset-password/{Uri.EscapeDataString(reset.RawToken)}";
            var resetUrl = _publicBaseUrl.BuildAbsoluteUrl(resetPath);

            var sendResult = await SendResetEmailAsync(
                emailProvider,
                ph.Name,
                owner.DisplayName,
                normalized,
                resetUrl,
                reset.Entity.ExpiresAtUtc,
                cancellationToken);

            if (sendResult.Succeeded)
            {
                await _audit.WriteSystemAsync(
                    ph.TenantId,
                    AuditEventType.OwnerPasswordResetRequested,
                    propertyHorizontalId: membership.PropertyHorizontalId,
                    correlationId: reset.Entity.Id,
                    userId: userId,
                    metadata: new
                    {
                        ownerId = owner.Id,
                        userId,
                        emailMasked = MaskEmail(normalized),
                        provider = providerName,
                        usedSandbox,
                        providerMessageId = sendResult.ProviderMessageId,
                        source = "self_serve"
                    },
                    cancellationToken: cancellationToken);
            }
            else
            {
                await _audit.WriteSystemAsync(
                    ph.TenantId,
                    AuditEventType.OwnerPasswordResetRequested,
                    propertyHorizontalId: membership.PropertyHorizontalId,
                    correlationId: reset.Entity.Id,
                    userId: userId,
                    metadata: new
                    {
                        ownerId = owner.Id,
                        userId,
                        emailMasked = MaskEmail(normalized),
                        provider = providerName,
                        usedSandbox,
                        emailSent = false,
                        detail = sendResult.Detail,
                        source = "self_serve"
                    },
                    cancellationToken: cancellationToken);
            }
        }
        catch
        {
            // Anti-enumeration: never reveal failures to the caller.
        }

        return response;
    }

    public async Task<PasswordResetPreviewDto> PreviewAsync(
        string? token,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return InvalidPreview("RESET_TOKEN_REQUIRED", "Enlace inválido. Solicita un nuevo restablecimiento.");
        }

        var hash = HashToken(token.Trim());
        var row = await _db.OwnerPasswordResets.IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.TokenHash == hash, cancellationToken);

        if (row is null)
        {
            return InvalidPreview("RESET_TOKEN_INVALID", "Este enlace no es válido. Solicita un nuevo restablecimiento.");
        }

        if (row.ConsumedAtUtc is not null)
        {
            return InvalidPreview("RESET_TOKEN_CONSUMED", "Este enlace ya fue usado. Solicita uno nuevo si aún necesitas cambiar la contraseña.");
        }

        if (row.ExpiresAtUtc <= DateTimeOffset.UtcNow)
        {
            return InvalidPreview("RESET_TOKEN_EXPIRED", "Este enlace venció. Solicita un nuevo restablecimiento.");
        }

        var owner = await _db.Owners.IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == row.OwnerId, cancellationToken);
        var ph = await _db.PropertyHorizontals.IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == row.PropertyHorizontalId, cancellationToken);

        return new PasswordResetPreviewDto(
            IsValid: true,
            EmailMasked: MaskEmail(row.Email),
            OwnerDisplayName: owner?.DisplayName,
            PropertyHorizontalName: ph?.Name,
            ExpiresAtUtc: row.ExpiresAtUtc,
            ErrorCode: null,
            ErrorMessage: null);
    }

    public async Task CompleteAsync(
        CompletePasswordResetRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new DomainException("RESET_TOKEN_REQUIRED", "Enlace inválido. Solicita un nuevo restablecimiento.");
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 12)
        {
            throw new DomainException(
                "PASSWORD_WEAK",
                "La contraseña debe tener al menos 12 caracteres, una mayúscula, una minúscula, un número y un símbolo (ej. ! @ # $).");
        }

        EnsurePasswordMeetsPolicy(request.Password);

        var hash = HashToken(request.Token.Trim());
        var row = await _db.OwnerPasswordResets.IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.TokenHash == hash, cancellationToken)
            ?? throw new DomainException("RESET_TOKEN_INVALID", "Este enlace no es válido. Solicita un nuevo restablecimiento.");

        if (row.ConsumedAtUtc is not null)
        {
            throw new DomainException(
                "RESET_TOKEN_CONSUMED",
                "Este enlace ya fue usado. Solicita uno nuevo si aún necesitas cambiar la contraseña.");
        }

        if (row.ExpiresAtUtc <= DateTimeOffset.UtcNow)
        {
            throw new DomainException("RESET_TOKEN_EXPIRED", "Este enlace venció. Solicita un nuevo restablecimiento.");
        }

        await _identity.ResetPasswordAsync(row.UserId, request.Password, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        row.ConsumedAtUtc = now;
        row.ConsumedByUserId = row.UserId;
        row.UpdatedAtUtc = now;

        // Invalidate siblings for the same user.
        var siblings = await _db.OwnerPasswordResets.IgnoreQueryFilters()
            .Where(r => r.UserId == row.UserId && r.Id != row.Id && r.ConsumedAtUtc == null && r.ExpiresAtUtc > now)
            .ToListAsync(cancellationToken);
        foreach (var sibling in siblings)
        {
            sibling.ExpiresAtUtc = now.AddSeconds(-1);
            sibling.UpdatedAtUtc = now;
        }

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteSystemAsync(
            row.TenantId,
            AuditEventType.OwnerPasswordResetCompleted,
            propertyHorizontalId: row.PropertyHorizontalId,
            correlationId: row.Id,
            userId: row.UserId,
            metadata: new
            {
                ownerId = row.OwnerId,
                userId = row.UserId,
                emailMasked = MaskEmail(row.Email)
            },
            cancellationToken: cancellationToken);
    }

    private async Task<(OwnerPasswordReset Entity, string RawToken)> CreateResetAsync(
        Guid tenantId,
        Guid propertyHorizontalId,
        Guid ownerId,
        Guid userId,
        string email,
        Guid? createdByUserId,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var pending = await _db.OwnerPasswordResets.IgnoreQueryFilters()
            .Where(r =>
                r.UserId == userId
                && r.ConsumedAtUtc == null
                && r.ExpiresAtUtc > now)
            .ToListAsync(cancellationToken);
        foreach (var row in pending)
        {
            row.ExpiresAtUtc = now.AddSeconds(-1);
            row.UpdatedAtUtc = now;
        }

        var rawToken = CreateOpaqueToken();
        var entity = new OwnerPasswordReset
        {
            TenantId = tenantId,
            PropertyHorizontalId = propertyHorizontalId,
            OwnerId = ownerId,
            UserId = userId,
            Email = email,
            TokenHash = HashToken(rawToken),
            ExpiresAtUtc = now.Add(ResetLifetime),
            CreatedByUserId = createdByUserId
        };
        _db.OwnerPasswordResets.Add(entity);
        await _db.SaveChangesAsync(cancellationToken);
        return (entity, rawToken);
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

    private static async Task<ProviderSendResult> SendResetEmailAsync(
        IEmailProvider emailProvider,
        string phName,
        string ownerName,
        string email,
        string resetUrl,
        DateTimeOffset expires,
        CancellationToken cancellationToken)
    {
        var subject = $"Restablecer contraseña — {phName}";
        var safeName = System.Net.WebUtility.HtmlEncode(ownerName);
        var safePh = System.Net.WebUtility.HtmlEncode(phName);
        var safeUrl = System.Net.WebUtility.HtmlEncode(resetUrl);
        var expiresLabel = expires.ToString("dd MMM yyyy HH:mm") + " UTC";

        var text =
            $"Hola {ownerName},\n\nRecibimos una solicitud para restablecer tu contraseña de ASAMBLEAS ({phName}).\n" +
            $"Abre este enlace completo (un solo uso):\n{resetUrl}\n\n" +
            $"Importante: el enlace debe incluir el código después de /go/reset-password/\n" +
            $"Vence: {expiresLabel}\n\nSi no solicitaste este cambio, ignora este mensaje.\n" +
            "Nunca enviamos tu contraseña por correo: tú defines una nueva al abrir el enlace.";

        var html =
            $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">
              <p style="letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:#666">ASAMBLEAS</p>
              <h1 style="font-size:22px;margin:0 0 12px">Restablecer contraseña</h1>
              <p>Hola {safeName},</p>
              <p>Recibimos una solicitud para restablecer tu acceso a <strong>{safePh}</strong> en ASAMBLEAS.</p>
              <p>Elige una contraseña nueva con el botón siguiente. El enlace es de un solo uso.</p>
              <p style="margin:28px 0">
                <a href="{safeUrl}"
                   style="display:inline-block;background:#0f3d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">
                  Definir nueva contraseña
                </a>
              </p>
              <p style="font-size:13px;color:#555;word-break:break-all">
                Si el botón no abre bien, copia y pega este enlace completo:<br />
                <a href="{safeUrl}" style="color:#0f3d2e">{safeUrl}</a>
              </p>
              <p style="font-size:13px;color:#555">Vence: {System.Net.WebUtility.HtmlEncode(expiresLabel)}</p>
              <p style="font-size:12px;color:#777">Si no solicitaste este cambio, puedes ignorar este mensaje. Nunca enviamos tu contraseña por correo.</p>
            </div>
            """;

        return await emailProvider.SendAsync(
            new EmailMessage(email, ownerName, subject, html, text, null, null, null, null),
            cancellationToken);
    }

    private static PasswordResetPreviewDto InvalidPreview(string code, string message) =>
        new(false, null, null, null, null, code, message);

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

        return "No pudimos enviar el correo. Revisa Comunicaciones → Email/SMTP e inténtalo de nuevo.";
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
