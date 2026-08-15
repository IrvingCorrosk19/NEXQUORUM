namespace Asambleas.Infrastructure.Communications;

using System.Collections.Concurrent;
using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.Extensions.Logging;

public sealed class MockEmailProvider : IEmailProvider
{
    private static readonly ConcurrentQueue<CapturedMockEmail> Captured = new();
    private const int MaxCaptured = 50;

    private readonly ILogger<MockEmailProvider> _logger;

    public MockEmailProvider(ILogger<MockEmailProvider> logger) => _logger = logger;

    public CommunicationProviderType ProviderType => CommunicationProviderType.Mock;

    public bool SimulateFailure { get; set; }

    public static IReadOnlyList<CapturedMockEmail> Snapshot() => Captured.ToArray();

    public static void Clear()
    {
        while (Captured.TryDequeue(out _))
        {
        }
    }

    public Task<ProviderSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "MOCK email to={To} subject={Subject} fail={Fail}",
            message.To,
            message.Subject,
            SimulateFailure);

        Captured.Enqueue(new CapturedMockEmail(
            DateTimeOffset.UtcNow,
            message.To,
            message.Subject,
            message.HtmlBody,
            message.TextBody));
        while (Captured.Count > MaxCaptured && Captured.TryDequeue(out _))
        {
        }

        if (SimulateFailure)
        {
            return Task.FromResult(new ProviderSendResult(
                false,
                DeliveryStatus.Failed,
                null,
                "Mock email forced failure (simulateFailure=true).",
                UsedSandbox: true));
        }

        return Task.FromResult(new ProviderSendResult(
            true,
            DeliveryStatus.Sent,
            $"mock-email-{Guid.NewGuid():N}",
            "Mock email accepted (sandbox). Status=Sent (MOCK: provider acceptance, not mailbox delivery).",
            UsedSandbox: true));
    }
}

public sealed record CapturedMockEmail(
    DateTimeOffset AtUtc,
    string To,
    string Subject,
    string? HtmlBody,
    string? TextBody);

public sealed class SmtpEmailProvider : IEmailProvider
{
    private readonly SmtpClientSettings _settings;
    private readonly ILogger<SmtpEmailProvider> _logger;

    public SmtpEmailProvider(SmtpClientSettings settings, ILogger<SmtpEmailProvider> logger)
    {
        _settings = settings;
        _logger = logger;
    }

    public CommunicationProviderType ProviderType => CommunicationProviderType.Smtp;

    public async Task<ProviderSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        try
        {
            using var client = new SmtpClient(_settings.Host, _settings.Port)
            {
                EnableSsl = _settings.UseSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network
            };

            if (!string.IsNullOrWhiteSpace(_settings.Username))
            {
                client.Credentials = new NetworkCredential(_settings.Username, _settings.Password);
            }

            var from = message.FromAddress ?? _settings.FromAddress
                ?? throw new InvalidOperationException("SMTP FromAddress is required.");

            using var mail = new MailMessage
            {
                From = new MailAddress(from, message.FromDisplayName ?? _settings.FromDisplayName),
                Subject = message.Subject
            };
            mail.To.Add(new MailAddress(message.To, message.ToDisplayName));
            if (!string.IsNullOrWhiteSpace(message.ReplyTo ?? _settings.ReplyTo))
            {
                mail.ReplyToList.Add(message.ReplyTo ?? _settings.ReplyTo!);
            }

            // Multipart: text/plain + text/html when both are present (email clients / accessibility).
            var hasHtml = !string.IsNullOrWhiteSpace(message.HtmlBody);
            var hasText = !string.IsNullOrWhiteSpace(message.TextBody);
            if (hasHtml && hasText)
            {
                mail.AlternateViews.Add(
                    AlternateView.CreateAlternateViewFromString(message.TextBody, Encoding.UTF8, MediaTypeNames.Text.Plain));
                mail.AlternateViews.Add(
                    AlternateView.CreateAlternateViewFromString(message.HtmlBody, Encoding.UTF8, MediaTypeNames.Text.Html));
            }
            else if (hasHtml)
            {
                mail.Body = message.HtmlBody;
                mail.IsBodyHtml = true;
            }
            else
            {
                mail.Body = message.TextBody ?? string.Empty;
                mail.IsBodyHtml = false;
            }

            await client.SendMailAsync(mail, cancellationToken);
            return new ProviderSendResult(
                true,
                DeliveryStatus.Sent,
                $"smtp-{Guid.NewGuid():N}",
                "SMTP accepted message for delivery.",
                UsedSandbox: false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SMTP send failed to {To}", message.To);
            var (code, detail) = MapSmtpException(ex);
            return new ProviderSendResult(
                false,
                DeliveryStatus.Failed,
                null,
                $"{code}: {detail}",
                UsedSandbox: false);
        }
    }

    private static (string Code, string Detail) MapSmtpException(Exception ex)
    {
        var text = ex.ToString();
        if (ex is SmtpException smtp)
        {
            if (smtp.StatusCode is SmtpStatusCode.MailboxUnavailable
                or SmtpStatusCode.MailboxNameNotAllowed)
            {
                return ("INVALID_RECIPIENT", "El destinatario de prueba no es válido.");
            }

            if (smtp.StatusCode == SmtpStatusCode.MustIssueStartTlsFirst
                || text.Contains("SSL", StringComparison.OrdinalIgnoreCase)
                || text.Contains("TLS", StringComparison.OrdinalIgnoreCase))
            {
                return ("TLS_FAILED", "No fue posible establecer una conexión segura con SMTP.");
            }
        }

        if (text.Contains("timed out", StringComparison.OrdinalIgnoreCase)
            || text.Contains("timeout", StringComparison.OrdinalIgnoreCase)
            || ex is TimeoutException)
        {
            return ("CONNECTION_TIMEOUT", "No pudimos conectar con el servidor SMTP.");
        }

        if (text.Contains("Authentication", StringComparison.OrdinalIgnoreCase)
            || text.Contains("5.7.0", StringComparison.Ordinal)
            || text.Contains("5.7.8", StringComparison.Ordinal)
            || text.Contains("535", StringComparison.Ordinal)
            || text.Contains("Username and Password not accepted", StringComparison.OrdinalIgnoreCase))
        {
            return (
                "AUTHENTICATION_FAILED",
                "No pudimos autenticar la cuenta de correo. Verifica la contraseña de aplicación.");
        }

        if (text.Contains("No connection", StringComparison.OrdinalIgnoreCase)
            || text.Contains("actively refused", StringComparison.OrdinalIgnoreCase)
            || text.Contains("Name or service not known", StringComparison.OrdinalIgnoreCase)
            || text.Contains("Network is unreachable", StringComparison.OrdinalIgnoreCase))
        {
            return ("CONNECTION_TIMEOUT", "No pudimos conectar con el servidor SMTP.");
        }

        // Never echo raw exception details that might include credentials.
        return ("UNKNOWN", "No se pudo enviar el correo de prueba. Revisa la configuración SMTP.");
    }
}

public sealed class SmtpClientSettings
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public bool UseSsl { get; set; } = true;
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string? FromAddress { get; set; }
    public string? FromDisplayName { get; set; }
    public string? ReplyTo { get; set; }

    public static SmtpClientSettings FromJson(string settingsJson, string? password)
    {
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(settingsJson) ? "{}" : settingsJson);
        var root = doc.RootElement;
        string? Get(string name) =>
            root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;

        int port = 587;
        if (root.TryGetProperty("port", out var portEl))
        {
            if (portEl.ValueKind == JsonValueKind.Number && portEl.TryGetInt32(out var parsedNum))
            {
                port = parsedNum;
            }
            else if (portEl.ValueKind == JsonValueKind.String
                     && int.TryParse(portEl.GetString(), out var parsedStr)
                     && parsedStr is >= 1 and <= 65535)
            {
                // UI stores port as string from <input>; accept both Number and String.
                port = parsedStr;
            }
        }

        var useSsl = true;
        if (root.TryGetProperty("useSsl", out var sslEl))
        {
            if (sslEl.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                useSsl = sslEl.GetBoolean();
            }
            else if (sslEl.ValueKind == JsonValueKind.String
                     && bool.TryParse(sslEl.GetString(), out var parsedSsl))
            {
                useSsl = parsedSsl;
            }
        }

        // Port 587 = SMTP submission with STARTTLS (EnableSsl=true on SmtpClient).
        // Port 465 = implicit SSL; leave UseSsl true as well.
        if (port == 587)
        {
            useSsl = true;
        }

        return new SmtpClientSettings
        {
            Host = Get("host") ?? string.Empty,
            Port = port,
            UseSsl = useSsl,
            Username = Get("username"),
            Password = password,
            FromAddress = Get("fromAddress"),
            FromDisplayName = Get("fromDisplayName"),
            ReplyTo = Get("replyTo")
        };
    }
}

public sealed class MockWhatsAppProvider : IWhatsAppProvider
{
    private readonly ILogger<MockWhatsAppProvider> _logger;

    public MockWhatsAppProvider(ILogger<MockWhatsAppProvider> logger) => _logger = logger;

    public CommunicationProviderType ProviderType => CommunicationProviderType.Mock;

    public bool SimulateFailure { get; set; }

    public Task<ProviderSendResult> SendAsync(WhatsAppMessage message, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("MOCK WhatsApp to={To} fail={Fail}", message.ToE164, SimulateFailure);
        if (SimulateFailure)
        {
            return Task.FromResult(new ProviderSendResult(
                false,
                DeliveryStatus.Failed,
                null,
                "Mock WhatsApp forced failure (simulateFailure=true).",
                UsedSandbox: true));
        }

        return Task.FromResult(new ProviderSendResult(
            true,
            DeliveryStatus.Sent,
            $"mock-wa-{Guid.NewGuid():N}",
            "Mock WhatsApp accepted (sandbox). Status=Sent (MOCK).",
            UsedSandbox: true));
    }
}

public sealed class MockSmsProvider : ISmsProvider
{
    private readonly ILogger<MockSmsProvider> _logger;

    public MockSmsProvider(ILogger<MockSmsProvider> logger) => _logger = logger;

    public CommunicationProviderType ProviderType => CommunicationProviderType.Mock;

    public bool SimulateFailure { get; set; }

    public Task<ProviderSendResult> SendAsync(SmsMessage message, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("MOCK SMS to={To} fail={Fail}", message.ToE164, SimulateFailure);
        if (SimulateFailure)
        {
            return Task.FromResult(new ProviderSendResult(
                false,
                DeliveryStatus.Failed,
                null,
                "Mock SMS forced failure (simulateFailure=true).",
                UsedSandbox: true));
            }

        return Task.FromResult(new ProviderSendResult(
            true,
            DeliveryStatus.Sent,
            $"mock-sms-{Guid.NewGuid():N}",
            "Mock SMS accepted (sandbox). Status=Sent (MOCK).",
            UsedSandbox: true));
    }
}

public sealed class PortalNotificationProvider : IPortalNotificationProvider
{
    private readonly IAsambleasDbContext _db;

    public PortalNotificationProvider(IAsambleasDbContext db) => _db = db;

    public async Task<ProviderSendResult> SendAsync(PortalMessage message, CancellationToken cancellationToken = default)
    {
        _db.PortalNotifications.Add(new PortalNotification
        {
            TenantId = message.TenantId,
            PropertyHorizontalId = message.PropertyHorizontalId,
            UserId = message.UserId,
            OwnerId = message.OwnerId,
            ConvocationId = message.ConvocationId,
            DeliveryId = message.DeliveryId,
            Title = message.Title,
            Body = message.Body
        });
        // Caller persists via unit-of-work (batch dispatch).
        await Task.CompletedTask;
        return new ProviderSendResult(
            true,
            DeliveryStatus.Delivered,
            $"portal-{Guid.NewGuid():N}",
            "Portal notification queued.",
            UsedSandbox: false);
    }
}
