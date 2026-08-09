namespace Asambleas.Application.Communications;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

public sealed class DeliveryDispatchService
{
    private readonly IAsambleasDbContext _db;
    private readonly CommunicationConfigurationService _config;
    private readonly ICommunicationEnvironment _environment;
    private readonly IPortalNotificationProvider _portal;
    private readonly IWhatsAppProvider _mockWhatsApp;
    private readonly ISmsProvider _mockSms;
    private readonly ILogger<DeliveryDispatchService> _logger;

    public DeliveryDispatchService(
        IAsambleasDbContext db,
        CommunicationConfigurationService config,
        ICommunicationEnvironment environment,
        IPortalNotificationProvider portal,
        IWhatsAppProvider mockWhatsApp,
        ISmsProvider mockSms,
        ILogger<DeliveryDispatchService> logger)
    {
        _db = db;
        _config = config;
        _environment = environment;
        _portal = portal;
        _mockWhatsApp = mockWhatsApp;
        _mockSms = mockSms;
        _logger = logger;
    }

    public async Task ProcessBatchAsync(Guid batchId, CancellationToken cancellationToken = default)
    {
        var batch = await _db.CommunicationBatches.FirstOrDefaultAsync(b => b.Id == batchId, cancellationToken);
        if (batch is null)
        {
            return;
        }

        var convocation = await _db.Convocations.FirstAsync(c => c.Id == batch.ConvocationId, cancellationToken);
        var (profile, emailCfg, waCfg, smsCfg, portalCfg) =
            await _config.LoadRuntimeAsync(convocation.PropertyHorizontalId, cancellationToken);

        var forceMock = profile.SandboxMode || _environment.IsNonProduction;
        var emailProvider = await _config.ResolveEmailProviderAsync(emailCfg, forceMock, cancellationToken);

        var deliveries = await _db.CommunicationDeliveries
            .Where(d => d.BatchId == batchId && d.Status == DeliveryStatus.Pending)
            .ToListAsync(cancellationToken);

        var recipients = await _db.ConvocationRecipients
            .Where(r => r.ConvocationId == convocation.Id)
            .ToDictionaryAsync(r => r.Id, cancellationToken);

        foreach (var delivery in deliveries)
        {
            if (!recipients.TryGetValue(delivery.RecipientId, out var recipient))
            {
                await MarkAsync(delivery, DeliveryStatus.Skipped, null, "Recipient missing.", cancellationToken);
                batch.SkippedCount++;
                continue;
            }

            try
            {
                var result = await SendOneAsync(
                    delivery,
                    recipient,
                    convocation,
                    profile,
                    emailProvider,
                    emailCfg,
                    waCfg,
                    smsCfg,
                    portalCfg,
                    forceMock,
                    cancellationToken);

                delivery.ProviderType = result.ProviderType;
                delivery.Destination = result.Destination;
                delivery.WasRedirectedToTestOverride = result.Redirected;
                delivery.AttemptCount += 1;

                if (result.Send.Succeeded)
                {
                    delivery.ProviderMessageId = result.Send.ProviderMessageId;
                    if (result.Send.Status == DeliveryStatus.Delivered)
                    {
                        await MarkAsync(delivery, DeliveryStatus.Delivered, result.Send.ProviderMessageId, result.Send.Detail, cancellationToken);
                        delivery.DeliveredAtUtc = DateTimeOffset.UtcNow;
                        batch.DeliveredCount++;
                        batch.SentCount++;
                    }
                    else
                    {
                        await MarkAsync(delivery, DeliveryStatus.Sent, result.Send.ProviderMessageId, result.Send.Detail, cancellationToken);
                        batch.SentCount++;
                    }
                }
                else
                {
                    await MarkAsync(delivery, DeliveryStatus.Failed, null, result.Send.Detail, cancellationToken);
                    batch.FailedCount++;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Delivery {DeliveryId} failed unexpectedly", delivery.Id);
                await MarkAsync(delivery, DeliveryStatus.Failed, null, ex.Message, cancellationToken);
                batch.FailedCount++;
            }
        }

        batch.CompletedAtUtc = DateTimeOffset.UtcNow;
        batch.Status = batch.FailedCount == 0
            ? ConvocationStatus.Sent
            : batch.SentCount + batch.DeliveredCount > 0
                ? ConvocationStatus.Partial
                : ConvocationStatus.Failed;

        convocation.Status = batch.Status;
        convocation.SentAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<(ProviderSendResult Send, CommunicationProviderType ProviderType, string? Destination, bool Redirected)>
        SendOneAsync(
            CommunicationDelivery delivery,
            ConvocationRecipient recipient,
            Convocation convocation,
            CommunicationProfile profile,
            IEmailProvider emailProvider,
            ChannelConfiguration? emailCfg,
            ChannelConfiguration? waCfg,
            ChannelConfiguration? smsCfg,
            ChannelConfiguration? portalCfg,
            bool forceMock,
            CancellationToken cancellationToken)
    {
        switch (delivery.Channel)
        {
            case CommunicationChannel.Email:
            {
                if (emailCfg is { IsEnabled: false })
                {
                    return (new ProviderSendResult(false, DeliveryStatus.Skipped, null, "Email channel disabled.", forceMock),
                        CommunicationProviderType.Mock, recipient.Email, false);
                }

                var to = recipient.Email!;
                var redirected = false;
                if (forceMock && !string.IsNullOrWhiteSpace(profile.TestRecipientOverride))
                {
                    to = profile.TestRecipientOverride!;
                    redirected = true;
                }

                if (ReadSimulateFailure(emailCfg))
                {
                    return (new ProviderSendResult(
                            false,
                            DeliveryStatus.Failed,
                            null,
                            "Mock email forced failure (simulateFailure=true).",
                            true),
                        CommunicationProviderType.Mock,
                        to,
                        redirected);
                }

                var send = await emailProvider.SendAsync(
                    new EmailMessage(
                        to,
                        recipient.DisplayName,
                        convocation.Subject,
                        Render(convocation.BodyHtml, recipient, convocation),
                        Render(convocation.BodyText, recipient, convocation),
                        null,
                        profile.DefaultFromDisplayName,
                        profile.DefaultReplyTo,
                        null),
                    cancellationToken);
                return (send, emailProvider.ProviderType, to, redirected);
            }
            case CommunicationChannel.WhatsApp:
            {
                if (waCfg is { IsEnabled: false } || string.IsNullOrWhiteSpace(recipient.PhoneE164))
                {
                    return (new ProviderSendResult(false, DeliveryStatus.Skipped, null, "WhatsApp unavailable.", forceMock),
                        CommunicationProviderType.Mock, recipient.PhoneE164, false);
                }

                var to = recipient.PhoneE164!;
                var redirected = false;
                if (forceMock && !string.IsNullOrWhiteSpace(profile.TestRecipientOverride))
                {
                    to = profile.TestRecipientOverride!;
                    redirected = true;
                }

                if (ReadSimulateFailure(waCfg))
                {
                    return (new ProviderSendResult(false, DeliveryStatus.Failed, null, "Mock WhatsApp forced failure (simulateFailure=true).", true),
                        CommunicationProviderType.Mock, to, redirected);
                }

                var send = await _mockWhatsApp.SendAsync(
                    new WhatsAppMessage(to, Render(convocation.BodyText, recipient, convocation), null, null),
                    cancellationToken);
                return (send, _mockWhatsApp.ProviderType, to, redirected);
            }
            case CommunicationChannel.Sms:
            {
                if (smsCfg is { IsEnabled: false } || string.IsNullOrWhiteSpace(recipient.PhoneE164))
                {
                    return (new ProviderSendResult(false, DeliveryStatus.Skipped, null, "SMS unavailable.", forceMock),
                        CommunicationProviderType.Mock, recipient.PhoneE164, false);
                }

                var to = recipient.PhoneE164!;
                var redirected = false;
                if (forceMock && !string.IsNullOrWhiteSpace(profile.TestRecipientOverride))
                {
                    to = profile.TestRecipientOverride!;
                    redirected = true;
                }

                if (ReadSimulateFailure(smsCfg))
                {
                    return (new ProviderSendResult(false, DeliveryStatus.Failed, null, "Mock SMS forced failure (simulateFailure=true).", true),
                        CommunicationProviderType.Mock, to, redirected);
                }

                var send = await _mockSms.SendAsync(
                    new SmsMessage(to, Render(convocation.BodyText, recipient, convocation)),
                    cancellationToken);
                return (send, _mockSms.ProviderType, to, redirected);
            }
            case CommunicationChannel.Portal:
            {
                if (portalCfg is { IsEnabled: false })
                {
                    return (new ProviderSendResult(false, DeliveryStatus.Skipped, null, "Portal disabled.", false),
                        CommunicationProviderType.Portal, recipient.UserId?.ToString(), false);
                }

                var send = await _portal.SendAsync(
                    new PortalMessage(
                        convocation.TenantId,
                        convocation.PropertyHorizontalId,
                        recipient.UserId,
                        recipient.OwnerId,
                        convocation.Id,
                        delivery.Id,
                        convocation.Subject,
                        Render(convocation.BodyText, recipient, convocation)),
                    cancellationToken);
                return (send, CommunicationProviderType.Portal, recipient.UserId?.ToString() ?? recipient.OwnerId?.ToString(), false);
            }
            default:
                return (new ProviderSendResult(false, DeliveryStatus.Skipped, null, $"Channel {delivery.Channel} not implemented in slice 1.", forceMock),
                    CommunicationProviderType.Mock, null, false);
        }
    }

    private async Task MarkAsync(
        CommunicationDelivery delivery,
        DeliveryStatus status,
        string? providerMessageId,
        string? detail,
        CancellationToken cancellationToken)
    {
        delivery.Status = status;
        delivery.ProviderMessageId ??= providerMessageId;
        delivery.ErrorDetail = status is DeliveryStatus.Failed or DeliveryStatus.Skipped ? detail : null;
        if (status is DeliveryStatus.Sent or DeliveryStatus.Delivered)
        {
            delivery.SentAtUtc = DateTimeOffset.UtcNow;
        }

        _db.CommunicationDeliveryEvents.Add(new CommunicationDeliveryEvent
        {
            TenantId = delivery.TenantId,
            DeliveryId = delivery.Id,
            Status = status,
            EventType = status.ToString(),
            Detail = detail,
            OccurredAtUtc = DateTimeOffset.UtcNow
        });

        await Task.CompletedTask;
    }

    private static string Render(string template, ConvocationRecipient recipient, Convocation convocation) =>
        template
            .Replace("{{nombre}}", recipient.DisplayName, StringComparison.OrdinalIgnoreCase)
            .Replace("{{email}}", recipient.Email ?? string.Empty, StringComparison.OrdinalIgnoreCase)
            .Replace("{{asunto}}", convocation.Subject, StringComparison.OrdinalIgnoreCase)
            .Replace("{{titulo}}", convocation.Title, StringComparison.OrdinalIgnoreCase);

    private static bool ReadSimulateFailure(ChannelConfiguration? config)
    {
        if (config is null || string.IsNullOrWhiteSpace(config.SettingsJson))
        {
            return false;
        }

        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(config.SettingsJson);
            if (!doc.RootElement.TryGetProperty("simulateFailure", out var p))
            {
                return false;
            }

            return p.ValueKind switch
            {
                System.Text.Json.JsonValueKind.True => true,
                System.Text.Json.JsonValueKind.String => bool.TryParse(p.GetString(), out var b) && b,
                System.Text.Json.JsonValueKind.Number => p.TryGetInt32(out var n) && n != 0,
                _ => false
            };
        }
        catch (System.Text.Json.JsonException)
        {
            return false;
        }
    }
}
