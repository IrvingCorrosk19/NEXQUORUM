namespace Asambleas.Application.Communications;

using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using Asambleas.Application.Abstractions;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class AssemblyAccessLinkService
{
    public static readonly TimeSpan DefaultLifetime = TimeSpan.FromDays(14);

    private readonly IAsambleasDbContext _db;

    public AssemblyAccessLinkService(IAsambleasDbContext db) => _db = db;

    public async Task<(string RawToken, string AbsoluteUrl, AssemblyAccessLink Link)> IssueAsync(
        Convocation convocation,
        ConvocationRecipient recipient,
        Guid? deliveryId,
        DateTimeOffset? assemblyScheduledAtUtc,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var prior = await _db.AssemblyAccessLinks
            .Where(l =>
                l.ConvocationId == convocation.Id
                && l.RecipientId == recipient.Id
                && l.RevokedAtUtc == null
                && l.ExpiresAtUtc > now)
            .ToListAsync(cancellationToken);
        foreach (var old in prior)
        {
            old.RevokedAtUtc = now;
        }

        var raw = CreateOpaqueToken();
        var expires = ResolveExpiry(assemblyScheduledAtUtc, now);
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
            Purpose = "ConvocationJoin"
        };
        _db.AssemblyAccessLinks.Add(link);
        await _db.SaveChangesAsync(cancellationToken);

        var url = BuildAbsoluteUrl($"/join.html?token={Uri.EscapeDataString(raw)}");
        return (raw, url, link);
    }

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

        var now = DateTimeOffset.UtcNow;
        if (link.RevokedAtUtc is not null || link.ExpiresAtUtc <= now)
        {
            return null;
        }

        link.LastUsedAtUtc = now;
        await _db.SaveChangesAsync(cancellationToken);
        return link;
    }

    public async Task RevokeAsync(Guid linkId, CancellationToken cancellationToken = default)
    {
        var link = await _db.AssemblyAccessLinks.FirstOrDefaultAsync(l => l.Id == linkId, cancellationToken)
            ?? throw new DomainException("ACCESS_LINK_NOT_FOUND", "Enlace de acceso no encontrado.");
        link.RevokedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
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

    public static string BuildAbsoluteUrl(string path)
    {
        var baseUrl = FirstNonEmpty(
            Environment.GetEnvironmentVariable("ASAMBLEAS_PUBLIC_BASE_URL"),
            Environment.GetEnvironmentVariable("App__PublicBaseUrl"));
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new DomainException(
                "PUBLIC_BASE_URL_REQUIRED",
                "ASAMBLEAS_PUBLIC_BASE_URL no está configurada. No se pueden generar enlaces de convocatoria.");
        }

        return $"{baseUrl.TrimEnd('/')}{path}";
    }

    private static DateTimeOffset ResolveExpiry(DateTimeOffset? scheduledAtUtc, DateTimeOffset now)
    {
        if (scheduledAtUtc is DateTimeOffset scheduled)
        {
            var until = scheduled.AddDays(2);
            if (until > now.AddHours(24))
            {
                return until;
            }
        }

        return now.Add(DefaultLifetime);
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var v in values)
        {
            if (!string.IsNullOrWhiteSpace(v))
            {
                return v.Trim();
            }
        }

        return null;
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
                      Acceder a la asamblea
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

        Acceder a la asamblea:
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
