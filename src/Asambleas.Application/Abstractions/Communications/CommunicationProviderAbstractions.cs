namespace Asambleas.Application.Abstractions.Communications;

using Asambleas.Domain.Enums;

public sealed record EmailMessage(
    string To,
    string? ToDisplayName,
    string Subject,
    string HtmlBody,
    string TextBody,
    string? FromAddress,
    string? FromDisplayName,
    string? ReplyTo,
    IReadOnlyDictionary<string, string>? Headers);

public sealed record WhatsAppMessage(
    string ToE164,
    string Body,
    string? TemplateCode,
    IReadOnlyDictionary<string, string>? TemplateParams);

public sealed record SmsMessage(string ToE164, string Body);

public sealed record PortalMessage(
    Guid TenantId,
    Guid PropertyHorizontalId,
    Guid? UserId,
    Guid? OwnerId,
    Guid? ConvocationId,
    Guid? DeliveryId,
    string Title,
    string Body);

public sealed record ProviderSendResult(
    bool Succeeded,
    DeliveryStatus Status,
    string? ProviderMessageId,
    string? Detail,
    bool UsedSandbox);

public interface IEmailProvider
{
    CommunicationProviderType ProviderType { get; }

    Task<ProviderSendResult> SendAsync(EmailMessage message, CancellationToken cancellationToken = default);
}

public interface IWhatsAppProvider
{
    CommunicationProviderType ProviderType { get; }

    Task<ProviderSendResult> SendAsync(WhatsAppMessage message, CancellationToken cancellationToken = default);
}

public interface ISmsProvider
{
    CommunicationProviderType ProviderType { get; }

    Task<ProviderSendResult> SendAsync(SmsMessage message, CancellationToken cancellationToken = default);
}

public interface IPortalNotificationProvider
{
    Task<ProviderSendResult> SendAsync(PortalMessage message, CancellationToken cancellationToken = default);
}

public interface ISecretProtector
{
    string Protect(string plaintext);

    string Unprotect(string ciphertext);
}

public interface ICommunicationEnvironment
{
    bool IsNonProduction { get; }

    string EnvironmentLabel { get; }
}
