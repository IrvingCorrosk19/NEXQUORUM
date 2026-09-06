namespace Asambleas.Application.Communications;

using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Domain.Attendance;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class AssemblyAccessLinkService
{
    public static readonly TimeSpan DefaultLifetime = TimeSpan.FromDays(14);
    public static readonly TimeSpan MinimumLifetimeFromIssue = TimeSpan.FromHours(24);
    public static readonly TimeSpan PostAssemblyGrace = TimeSpan.FromHours(48);

    private readonly IAsambleasDbContext _db;
    private readonly IPublicBaseUrlProvider _publicBaseUrl;
    private readonly TimeProvider _clock;
    private readonly IVerifiedJoinProofService _verifiedJoinProofs;

    public AssemblyAccessLinkService(
        IAsambleasDbContext db,
        IPublicBaseUrlProvider publicBaseUrl,
        TimeProvider clock,
        IVerifiedJoinProofService verifiedJoinProofs)
    {
        _db = db;
        _publicBaseUrl = publicBaseUrl;
        _clock = clock;
        _verifiedJoinProofs = verifiedJoinProofs;
    }

    public async Task<(string RawToken, string AbsoluteUrl, AssemblyAccessLink Link)> IssueAsync(
        Convocation convocation,
        ConvocationRecipient recipient,
        Guid? deliveryId,
        DateTimeOffset? assemblyScheduledAtUtc,
        CancellationToken cancellationToken = default) =>
        await IssueAsync(
            convocation,
            recipient,
            deliveryId,
            assemblyScheduledAtUtc,
            assemblyEstimatedEndAtUtc: null,
            revokeReason: AccessLinkRevocationReasons.Resent,
            cancellationToken);

    public async Task<(string RawToken, string AbsoluteUrl, AssemblyAccessLink Link)> IssueAsync(
        Convocation convocation,
        ConvocationRecipient recipient,
        Guid? deliveryId,
        DateTimeOffset? assemblyScheduledAtUtc,
        DateTimeOffset? assemblyEstimatedEndAtUtc,
        string revokeReason,
        CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow();
        var prior = await _db.AssemblyAccessLinks
            .IgnoreQueryFilters()
            .Where(l =>
                l.ConvocationId == convocation.Id
                && l.RecipientId == recipient.Id
                && l.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);
        foreach (var old in prior)
        {
            old.RevokedAtUtc = now;
            old.RevocationReason ??= revokeReason;
            InvalidateProofForLink(old);
        }

        var raw = CreateOpaqueToken();
        var expires = ResolveExpiry(now, assemblyScheduledAtUtc, assemblyEstimatedEndAtUtc);
        var link = new AssemblyAccessLink
        {
            TenantId = convocation.TenantId,
            PropertyHorizontalId = convocation.PropertyHorizontalId,
            AssemblyId = convocation.AssemblyId,
            ConvocationId = convocation.Id,
            RecipientId = recipient.Id,
            OwnerId = recipient.OwnerId,
            UserId = recipient.UserId,
            DeliveryId = deliveryId,
            TokenHash = HashToken(raw),
            ExpiresAtUtc = expires,
            CreatedAtUtc = now,
            Purpose = "ConvocationJoin"
        };
        _db.AssemblyAccessLinks.Add(link);
        await _db.SaveChangesAsync(cancellationToken);

        if (prior.Count > 0)
        {
            foreach (var old in prior)
            {
                old.ReplacedByLinkId = link.Id;
                if (string.IsNullOrWhiteSpace(old.RevocationReason))
                {
                    old.RevocationReason = revokeReason;
                }
            }

            await _db.SaveChangesAsync(cancellationToken);
        }

        var url = _publicBaseUrl.BuildAbsoluteUrl($"/ingresar/{Uri.EscapeDataString(raw)}");
        return (raw, url, link);
    }

    /// <summary>
    /// Expiration rules:
    /// - No schedule: IssuedAt + 14 days
    /// - With schedule: max(IssuedAt + 24h, (EstimatedEnd ?? ScheduledStart) + 48h)
    /// Exact ExpiresAt is already expired (&lt;=).
    /// </summary>
    public static DateTimeOffset ResolveExpiry(
        DateTimeOffset issuedAtUtc,
        DateTimeOffset? scheduledStartUtc,
        DateTimeOffset? scheduledEndUtc = null)
    {
        if (scheduledStartUtc is null && scheduledEndUtc is null)
        {
            return issuedAtUtc.Add(DefaultLifetime);
        }

        var anchor = scheduledEndUtc ?? scheduledStartUtc!.Value;
        var afterAssembly = anchor.Add(PostAssemblyGrace);
        var minimum = issuedAtUtc.Add(MinimumLifetimeFromIssue);
        return afterAssembly > minimum ? afterAssembly : minimum;
    }

    public async Task<int> RevokeActiveForAssemblyAsync(
        Guid assemblyId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow();
        var openLinks = await _db.AssemblyAccessLinks
            .Where(l => l.AssemblyId == assemblyId && l.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);
        foreach (var link in openLinks)
        {
            link.RevokedAtUtc = now;
            link.RevocationReason = reason;
            InvalidateProofForLink(link);
        }

        return openLinks.Count;
    }

    public async Task RevokeForRecipientAsync(
        Guid convocationId,
        Guid recipientId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var now = _clock.GetUtcNow();
        var openLinks = await _db.AssemblyAccessLinks
            .Where(l =>
                l.ConvocationId == convocationId
                && l.RecipientId == recipientId
                && l.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);
        foreach (var link in openLinks)
        {
            link.RevokedAtUtc = now;
            link.RevocationReason = reason;
            InvalidateProofForLink(link);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Silent replacement after reschedule when email notify is off.</summary>
    public async Task ReissueActiveRecipientsForConvocationAsync(
        Guid convocationId,
        DateTimeOffset? scheduledAtUtc,
        DateTimeOffset? estimatedEndAtUtc,
        CancellationToken cancellationToken = default)
    {
        var convocation = await _db.Convocations.FirstOrDefaultAsync(c => c.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        var recipients = await _db.ConvocationRecipients
            .Where(r => r.ConvocationId == convocationId && r.IsValid)
            .ToListAsync(cancellationToken);
        foreach (var recipient in recipients)
        {
            await IssueAsync(
                convocation,
                recipient,
                deliveryId: null,
                scheduledAtUtc,
                estimatedEndAtUtc,
                AccessLinkRevocationReasons.AssemblyRescheduled,
                cancellationToken);
        }
    }

    /// <summary>Lookup without mutating LastUsed (safe for preview / email scanners).</summary>
    public async Task<AssemblyAccessLink?> PeekValidAsync(string rawToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return null;
        }

        var hash = HashToken(rawToken.Trim());
        var link = await _db.AssemblyAccessLinks
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.TokenHash == hash, cancellationToken);
        if (link is null)
        {
            return null;
        }

        var now = _clock.GetUtcNow();
        if (link.RevokedAtUtc is not null || link.ExpiresAtUtc <= now)
        {
            return null;
        }

        return link;
    }

    /// <summary>Lookup that records LastUsedAtUtc (authenticated claim / redeem).</summary>
    public async Task<AssemblyAccessLink?> ResolveValidAsync(string rawToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return null;
        }

        var hash = HashToken(rawToken.Trim());
        var link = await _db.AssemblyAccessLinks
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(l => l.TokenHash == hash, cancellationToken);
        if (link is null)
        {
            return null;
        }

        var now = _clock.GetUtcNow();
        if (link.RevokedAtUtc is not null || link.ExpiresAtUtc <= now)
        {
            return null;
        }

        link.LastUsedAtUtc = now;
        await _db.SaveChangesAsync(cancellationToken);
        return link;
    }

    public async Task MarkRedeemedAsync(Guid linkId, CancellationToken cancellationToken = default)
    {
        var link = await _db.AssemblyAccessLinks.IgnoreQueryFilters()
            .FirstOrDefaultAsync(l => l.Id == linkId, cancellationToken);
        if (link is null)
        {
            return;
        }

        var now = _clock.GetUtcNow();
        link.LastUsedAtUtc = now;
        link.FirstRedeemedAtUtc ??= now;
        link.RedeemCount += 1;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task RevokeAsync(
        Guid linkId,
        string reason = AccessLinkRevocationReasons.IndividualRevoked,
        CancellationToken cancellationToken = default)
    {
        var link = await _db.AssemblyAccessLinks.FirstOrDefaultAsync(l => l.Id == linkId, cancellationToken)
            ?? throw new DomainException("ACCESS_LINK_NOT_FOUND", "Enlace de acceso no encontrado.");
        link.RevokedAtUtc = _clock.GetUtcNow();
        link.RevocationReason ??= reason;
        InvalidateProofForLink(link);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private void InvalidateProofForLink(AssemblyAccessLink link)
    {
        if (link.UserId is Guid uid && uid != Guid.Empty)
        {
            _verifiedJoinProofs.InvalidateAssemblyUser(link.AssemblyId, uid);
        }
    }

    /// <summary>
    /// Authenticated redeem of a convocation join link: binds the user to the recipient/owner
    /// and enrolls them as an <see cref="AssemblyParticipant"/> so portal/lobby/room authorize.
    /// </summary>
    public async Task<(Guid AssemblyId, string RedirectPath)> ClaimAsync(
        string rawToken,
        Guid userId,
        string? userEmail,
        CancellationToken cancellationToken = default)
    {
        if (userId == Guid.Empty)
        {
            throw new DomainException("AUTH_REQUIRED", "Debes iniciar sesión para canjear el acceso.");
        }

        var link = await ResolveValidAsync(rawToken, cancellationToken)
            ?? throw new DomainException(
                "INVALID_OR_EXPIRED",
                "Este enlace expiró o fue revocado. Solicita un reenvío de la convocatoria.");

        var recipient = await _db.ConvocationRecipients.IgnoreQueryFilters()
            .FirstOrDefaultAsync(r => r.Id == link.RecipientId, cancellationToken)
            ?? throw new DomainException("RECIPIENT_NOT_FOUND", "Destinatario de convocatoria no encontrado.");

        Owner? owner = null;
        if (link.OwnerId is Guid ownerId)
        {
            owner = await _db.Owners.IgnoreQueryFilters()
                .FirstOrDefaultAsync(o => o.Id == ownerId, cancellationToken);
        }

        var emailOk = !string.IsNullOrWhiteSpace(userEmail)
                      && (
                          (!string.IsNullOrWhiteSpace(recipient.Email)
                           && string.Equals(recipient.Email.Trim(), userEmail.Trim(), StringComparison.OrdinalIgnoreCase))
                          || (owner is not null
                              && string.Equals(owner.Email.Trim(), userEmail.Trim(), StringComparison.OrdinalIgnoreCase)));

        var userIdOk = (link.UserId is Guid linkUser && linkUser == userId)
                       || (recipient.UserId is Guid recipientUser && recipientUser == userId)
                       || (owner?.UserId is Guid ownerUser && ownerUser == userId);

        if (!emailOk && !userIdOk)
        {
            throw new DomainException(
                "JOIN_EMAIL_MISMATCH",
                "La sesión actual no corresponde al destinatario de esta convocatoria.");
        }

        recipient.UserId = userId;
        if (owner is not null)
        {
            owner.UserId ??= userId;
            if (owner.Status is OwnerLifecycleStatus.Invited or OwnerLifecycleStatus.Draft)
            {
                // Draft with units becomes Active on first successful join.
                // Draft without units is rejected below.
                var hasOwnershipOnPh = await (
                    from own in _db.Ownerships.AsNoTracking()
                    join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
                    where own.OwnerId == owner.Id
                          && own.IsActive
                          && u.IsActive
                          && u.PropertyHorizontalId == link.PropertyHorizontalId
                    select own.Id).AnyAsync(cancellationToken);

                if (!hasOwnershipOnPh)
                {
                    throw new DomainException(
                        AttendanceCodes.OwnerMissingUnits,
                        "No puede ingresar a la asamblea: el propietario no tiene unidades asignadas en esta propiedad. Un administrador debe vincular al menos una unidad.");
                }

                owner.Status = OwnerLifecycleStatus.Active;
            }
            else if (owner.Status == OwnerLifecycleStatus.Inactive)
            {
                throw new DomainException(
                    AttendanceCodes.OwnerInactive,
                    "Este propietario está inactivo y no puede ingresar a la asamblea.");
            }
        }

        link.UserId = userId;
        link.LastUsedAtUtc = _clock.GetUtcNow();

        await EnsureMembershipAsync(link.TenantId, userId, link.PropertyHorizontalId, cancellationToken);
        await EnsureParticipantAsync(
            link.TenantId,
            link.AssemblyId,
            link.PropertyHorizontalId,
            userId,
            recipient.DisplayName,
            owner?.Id,
            cancellationToken);

        await _db.SaveChangesAsync(cancellationToken);

        var status = await _db.Assemblies.IgnoreQueryFilters().AsNoTracking()
            .Where(a => a.Id == link.AssemblyId)
            .Select(a => a.Status)
            .FirstAsync(cancellationToken);

        var redirect = ResolveParticipantRoomRedirect(status, link.AssemblyId);

        return (link.AssemblyId, redirect);
    }

    /// <summary>
    /// One-click destination after passwordless redeem: the participant room (not lobby gate).
    /// </summary>
    public static string ResolveParticipantRoomRedirect(AssemblyStatus status, Guid assemblyId) =>
        status switch
        {
            AssemblyStatus.Completed => $"/dashboard.html?assemblyId={assemblyId:D}&mode=historical",
            AssemblyStatus.Cancelled => $"/join.html?reason=cancelled&assemblyId={assemblyId:D}",
            // Scheduled / CheckIn / InProgress / Paused / Draft → participant room (waiting or live).
            _ => $"/assembly.html?assemblyId={assemblyId:D}"
        };

    /// <summary>
    /// After an owner account is linked, enroll them into open assemblies where they are a convocation recipient.
    /// </summary>
    public async Task EnrollOwnerIntoOpenConvocationsAsync(
        Guid ownerId,
        Guid userId,
        string displayName,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var rows = await (
            from r in _db.ConvocationRecipients.IgnoreQueryFilters()
            join c in _db.Convocations.IgnoreQueryFilters() on r.ConvocationId equals c.Id
            join a in _db.Assemblies.IgnoreQueryFilters() on c.AssemblyId equals a.Id
            where r.OwnerId == ownerId
                  && r.IsValid
                  && c.Status == ConvocationStatus.Sent
                  && a.Status != AssemblyStatus.Completed
                  && a.Status != AssemblyStatus.Cancelled
            select new { Recipient = r, Assembly = a })
            .ToListAsync(cancellationToken);

        foreach (var row in rows)
        {
            row.Recipient.UserId = userId;
            await EnsureMembershipAsync(row.Assembly.TenantId, userId, row.Assembly.PropertyHorizontalId, cancellationToken);
            await EnsureParticipantAsync(
                row.Assembly.TenantId,
                row.Assembly.Id,
                row.Assembly.PropertyHorizontalId,
                userId,
                string.IsNullOrWhiteSpace(displayName) ? row.Recipient.DisplayName : displayName,
                ownerId,
                cancellationToken);
        }

        if (rows.Count > 0)
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task EnsureMembershipAsync(
        Guid tenantId,
        Guid userId,
        Guid propertyHorizontalId,
        CancellationToken cancellationToken)
    {
        var existing = await _db.UserPropertyMemberships.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                m => m.UserId == userId && m.PropertyHorizontalId == propertyHorizontalId,
                cancellationToken);
        if (existing is null)
        {
            _db.UserPropertyMemberships.Add(new UserPropertyMembership
            {
                TenantId = tenantId,
                UserId = userId,
                PropertyHorizontalId = propertyHorizontalId,
                RoleHint = Security.Roles.Owner,
                IsActive = true,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            });
        }
        else if (!existing.IsActive)
        {
            existing.IsActive = true;
            existing.UpdatedAtUtc = DateTimeOffset.UtcNow;
        }
    }

    private async Task EnsureParticipantAsync(
        Guid tenantId,
        Guid assemblyId,
        Guid propertyHorizontalId,
        Guid userId,
        string displayName,
        Guid? ownerId,
        CancellationToken cancellationToken)
    {
        var exists = await _db.AssemblyParticipants.IgnoreQueryFilters()
            .AnyAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken);
        if (exists)
        {
            return;
        }

        Guid? unitId = null;
        if (ownerId is Guid oid)
        {
            unitId = await (
                from own in _db.Ownerships.AsNoTracking()
                join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
                where own.OwnerId == oid
                      && own.IsActive
                      && u.PropertyHorizontalId == propertyHorizontalId
                orderby own.SharePercent descending
                select (Guid?)own.UnitId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        var now = DateTimeOffset.UtcNow;
        _db.AssemblyParticipants.Add(new AssemblyParticipant
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            AssemblyId = assemblyId,
            UserId = userId,
            UnitId = unitId,
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? "Propietario" : displayName.Trim(),
            RoleCode = Security.Roles.Owner,
            AttendanceStatus = AttendanceStatus.Registered,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });
    }

    public static string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes);
    }

    public static string CreateOpaqueToken()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}

/// <summary>Builds institutional multipart email content for convocations.</summary>
public static class ConvocationEmailComposer
{
    private static readonly CultureInfo EsPa = CultureInfo.GetCultureInfo("es-PA");

    public sealed record ComposeInput(
        string OwnerName,
        string PhName,
        string AssemblyTitle,
        string? AssemblyKind,
        DateTimeOffset? ScheduledAtUtc,
        string? TimeZoneId,
        string? Modality,
        string? LocationText,
        string? UnitCode,
        decimal? CoefficientPercent,
        IReadOnlyList<(int Ordinal, string Title)> Agenda,
        string AccessUrl,
        string? DocumentsUrl,
        bool Sandbox);

    public sealed record ComposeResult(string Subject, string Preheader, string Html, string Text);

    public static ComposeResult Compose(ComposeInput input)
    {
        var safeName = WebUtility.HtmlEncode(input.OwnerName);
        var safePh = WebUtility.HtmlEncode(input.PhName);
        var safeTitle = WebUtility.HtmlEncode(input.AssemblyTitle);
        var dateLabel = FormatDate(input.ScheduledAtUtc, input.TimeZoneId);
        var timeLabel = FormatTime(input.ScheduledAtUtc, input.TimeZoneId);
        var tzLabel = string.IsNullOrWhiteSpace(input.TimeZoneId) ? "hora local" : input.TimeZoneId!;
        var modality = string.IsNullOrWhiteSpace(input.Modality) ? "Virtual" : input.Modality!;
        var subjectDate = FormatSubjectDate(input.ScheduledAtUtc, input.TimeZoneId);
        var subject = $"Convocatoria | {input.AssemblyTitle} — {input.PhName} | {subjectDate}";
        var preheader =
            $"Ha sido convocado(a) a {input.AssemblyTitle} de {input.PhName}" +
            (string.IsNullOrWhiteSpace(dateLabel) ? "." : $" del {dateLabel}.");

        var agendaHtml = BuildAgendaHtml(input.Agenda);
        var agendaText = BuildAgendaText(input.Agenda);
        var unitBlockHtml = string.IsNullOrWhiteSpace(input.UnitCode)
            ? ""
            : $"""
              <tr><td style="padding:8px 0;border-top:1px solid #e5e7eb">
                <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Unidad</div>
                <div style="font-size:15px;color:#111827">{WebUtility.HtmlEncode(input.UnitCode)}</div>
                {(input.CoefficientPercent is decimal c
                    ? $"<div style=\"font-size:13px;color:#4b5563;margin-top:4px\">Participación / coeficiente: {c.ToString("0.####", EsPa)}%</div>"
                    : "")}
              </td></tr>
              """;

        var locationHtml = string.IsNullOrWhiteSpace(input.LocationText)
            ? ""
            : $"""
              <tr><td style="padding:8px 0">
                <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Lugar</div>
                <div style="font-size:15px;color:#111827">{WebUtility.HtmlEncode(input.LocationText)}</div>
              </td></tr>
              """;

        var sandboxBanner = input.Sandbox
            ? """<tr><td style="padding:10px 16px;background:#fef3c7;color:#92400e;font-size:13px">Modo prueba: este mensaje no es una convocatoria definitiva.</td></tr>"""
            : "";

        var access = WebUtility.HtmlEncode(input.AccessUrl);
        var docs = string.IsNullOrWhiteSpace(input.DocumentsUrl)
            ? ""
            : $"""
              <p style="margin:18px 0 0">
                <a href="{WebUtility.HtmlEncode(input.DocumentsUrl)}" style="color:#0f766e;font-weight:600;text-decoration:none">Ver documentos de la asamblea</a>
              </p>
              """;

        var html = $"""
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{safeTitle}</title></head>
        <body style="margin:0;padding:0;background:#f3f4f6;font-family:Segoe UI,Arial,Helvetica,sans-serif;color:#111827">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0">{WebUtility.HtmlEncode(preheader)}</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px">
            <tr><td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
                {sandboxBanner}
                <tr><td style="padding:28px 28px 12px;background:#0f3d2e;color:#ecfdf5">
                  <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">ASAMBLEAS</div>
                  <div style="font-size:14px;margin-top:6px;opacity:.9">Gobernanza digital para tu PH</div>
                </td></tr>
                <tr><td style="padding:28px">
                  <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#0f766e;font-weight:700">Convocatoria a asamblea</div>
                  <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.25;color:#111827">{safeTitle}</h1>
                  <div style="font-size:15px;color:#4b5563;margin-bottom:18px">{safePh}</div>
                  <p style="margin:0 0 16px;font-size:15px;line-height:1.55">Estimado(a) <strong>{safeName}</strong>:</p>
                  <p style="margin:0 0 20px;font-size:15px;line-height:1.55">Por este medio queda formalmente convocado(a) a la asamblea indicada.</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px">
                    <tr><td style="padding:8px 0">
                      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Fecha</div>
                      <div style="font-size:15px;color:#111827">{WebUtility.HtmlEncode(dateLabel)}</div>
                    </td></tr>
                    <tr><td style="padding:8px 0">
                      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Hora</div>
                      <div style="font-size:15px;color:#111827">{WebUtility.HtmlEncode(timeLabel)} <span style="color:#6b7280">({WebUtility.HtmlEncode(tzLabel)})</span></div>
                    </td></tr>
                    <tr><td style="padding:8px 0">
                      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Modalidad</div>
                      <div style="font-size:15px;color:#111827">{WebUtility.HtmlEncode(modality)}</div>
                    </td></tr>
                    {locationHtml}
                    {unitBlockHtml}
                  </table>
                  <p style="margin:0 0 22px">
                    <a href="{access}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:700;font-size:15px">
                      Ingresar a la asamblea
                    </a>
                  </p>
                  <p style="margin:0 0 8px;font-size:12px;color:#6b7280">Si el botón no funciona, copie y pegue este enlace en su navegador:</p>
                  <p style="margin:0 0 22px;font-size:12px;word-break:break-all"><a href="{access}" style="color:#0f766e">{access}</a></p>
                  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:8px">Agenda</div>
                  {agendaHtml}
                  {docs}
                  <p style="margin:22px 0 0;font-size:13px;color:#4b5563;line-height:1.5">
                    Importante: el acceso es personal y está asociado a su participación en esta asamblea.
                  </p>
                </td></tr>
                <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.5">
                  ASAMBLEAS · {safePh}<br />
                  Este mensaje fue enviado automáticamente como parte del proceso de convocatoria.
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
        """;

        var text = $"""
        ASAMBLEAS — Convocatoria a asamblea

        {input.PhName}
        {input.AssemblyTitle}

        Estimado(a) {input.OwnerName}:

        Queda formalmente convocado(a).

        Fecha: {dateLabel}
        Hora: {timeLabel} ({tzLabel})
        Modalidad: {modality}
        {(string.IsNullOrWhiteSpace(input.LocationText) ? "" : $"Lugar: {input.LocationText}\n")}
        {(string.IsNullOrWhiteSpace(input.UnitCode) ? "" : $"Unidad: {input.UnitCode}\n")}
        {(input.CoefficientPercent is decimal coef ? $"Coeficiente: {coef.ToString("0.####", EsPa)}%\n" : "")}

        Ingresar a la asamblea:
        {input.AccessUrl}

        Agenda
        {agendaText}

        El acceso es personal y está asociado a su participación en esta asamblea.

        ASAMBLEAS · {input.PhName}
        """;

        return new ComposeResult(subject, preheader, html, text);
    }

    private static string BuildAgendaHtml(IReadOnlyList<(int Ordinal, string Title)> agenda)
    {
        if (agenda.Count == 0)
        {
            return """<p style="margin:0;font-size:14px;color:#6b7280">La agenda será publicada por la administración.</p>""";
        }

        var items = string.Join(
            "",
            agenda.Select(a =>
                $"<li style=\"margin:0 0 6px;font-size:14px;color:#111827\">{a.Ordinal}. {WebUtility.HtmlEncode(a.Title)}</li>"));
        return $"<ol style=\"margin:0;padding-left:18px\">{items}</ol>";
    }

    private static string BuildAgendaText(IReadOnlyList<(int Ordinal, string Title)> agenda)
    {
        if (agenda.Count == 0)
        {
            return "La agenda será publicada por la administración.";
        }

        return string.Join("\n", agenda.Select(a => $"{a.Ordinal}. {a.Title}"));
    }

    private static string FormatDate(DateTimeOffset? utc, string? tz)
    {
        if (utc is null)
        {
            return "Por confirmar";
        }

        var local = ToLocal(utc.Value, tz);
        return local.ToString("d 'de' MMMM 'de' yyyy", EsPa);
    }

    private static string FormatTime(DateTimeOffset? utc, string? tz)
    {
        if (utc is null)
        {
            return "Por confirmar";
        }

        var local = ToLocal(utc.Value, tz);
        return local.ToString("h:mm tt", EsPa).ToLowerInvariant();
    }

    private static string FormatSubjectDate(DateTimeOffset? utc, string? tz)
    {
        if (utc is null)
        {
            return "fecha por confirmar";
        }

        var local = ToLocal(utc.Value, tz);
        return local.ToString("d MMM yyyy", EsPa);
    }

    private static DateTimeOffset ToLocal(DateTimeOffset utc, string? tz)
    {
        if (string.IsNullOrWhiteSpace(tz))
        {
            return utc.ToOffset(TimeSpan.FromHours(-5));
        }

        try
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(tz);
            var local = TimeZoneInfo.ConvertTime(utc, zone);
            return local;
        }
        catch (TimeZoneNotFoundException)
        {
            return utc.ToOffset(TimeSpan.FromHours(-5));
        }
        catch (InvalidTimeZoneException)
        {
            return utc.ToOffset(TimeSpan.FromHours(-5));
        }
    }
}
