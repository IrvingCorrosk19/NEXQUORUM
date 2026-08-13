namespace Asambleas.Contracts.Communications;

public sealed record CommunicationProfileDto(
    Guid Id,
    Guid PropertyHorizontalId,
    bool SandboxMode,
    string? TestRecipientOverride,
    string DefaultTimezoneId,
    string? DefaultFromDisplayName,
    string? DefaultReplyTo,
    bool IsSandboxEnvironment);

public sealed record UpdateCommunicationProfileRequest(
    bool SandboxMode,
    string? TestRecipientOverride,
    string DefaultTimezoneId,
    string? DefaultFromDisplayName,
    string? DefaultReplyTo);

public sealed record ChannelConfigurationDto(
    Guid Id,
    string Channel,
    string ProviderType,
    bool IsEnabled,
    IReadOnlyDictionary<string, string?> PublicSettings,
    bool HasSecret,
    DateTimeOffset? LastTestedAtUtc,
    bool? LastTestSucceeded,
    string? LastTestDetail);

public sealed record UpsertChannelConfigurationRequest(
    string ProviderType,
    bool IsEnabled,
    IReadOnlyDictionary<string, string?> Settings,
    string? Secret);

public sealed record ChannelTestRequest(string? Destination);

public sealed record ChannelTestResultDto(bool Succeeded, string Detail, DateTimeOffset TestedAtUtc);

public sealed record ConvocationEmailPreviewDto(
    string Subject,
    string Preheader,
    string Html,
    string Text);

public sealed record MessageTemplateDto(
    Guid Id,
    string Code,
    string Name,
    string ChannelScope,
    string? Subject,
    string BodyHtml,
    string BodyText,
    bool IsActive,
    int Version);

public sealed record UpsertMessageTemplateRequest(
    string Code,
    string Name,
    string ChannelScope,
    string? Subject,
    string BodyHtml,
    string BodyText,
    bool IsActive);

public sealed record ConvocationSummaryDto(
    Guid Id,
    Guid AssemblyId,
    string Title,
    string Status,
    int Version,
    IReadOnlyList<string> Channels,
    string Subject,
    DateTimeOffset? ScheduledAtUtc,
    DateTimeOffset? SentAtUtc,
    int RecipientCount,
    int ValidRecipientCount);

public sealed record ConvocationDetailDto(
    Guid Id,
    Guid AssemblyId,
    Guid PropertyHorizontalId,
    string Title,
    string Status,
    int Version,
    IReadOnlyList<string> Channels,
    string Subject,
    string BodyHtml,
    string BodyText,
    DateTimeOffset? ScheduledAtUtc,
    DateTimeOffset? SentAtUtc,
    IReadOnlyList<ConvocationRecipientDto> Recipients,
    SendPreviewDto? Preview);

public sealed record ConvocationRecipientDto(
    Guid Id,
    Guid? OwnerId,
    string DisplayName,
    string? Email,
    string? PhoneE164,
    IReadOnlyList<string> Channels,
    bool IsValid,
    IReadOnlyList<string> ValidationIssues);

public sealed record CreateConvocationRequest(
    Guid AssemblyId,
    string Title,
    string Subject,
    string BodyHtml,
    string BodyText,
    IReadOnlyList<string> Channels,
    Guid? TemplateId,
    string? IdempotencyKey);

public sealed record SendConvocationRequest(
    bool Confirmed = false,
    string? ConfirmationPhrase = null,
    string? IdempotencyKey = null,
    IReadOnlyList<Guid>? RecipientIds = null);

public sealed record ResendConvocationRequest(
    bool Confirmed = false,
    string? IdempotencyKey = null,
    IReadOnlyList<Guid>? RecipientIds = null,
    bool OnlyFailedOrPending = false);

public sealed record ConvocationRecipientDeliveryDto(
    Guid RecipientId,
    string DisplayName,
    string? Email,
    string? UnitCodes,
    string DeliveryStatus,
    DateTimeOffset? LastSentAtUtc,
    int EmailAttemptCount,
    bool CanResend);

public sealed record SendPreviewDto(
    int RecipientCount,
    IReadOnlyDictionary<string, int> ChannelCounts,
    int RecipientsMissingExternalChannel,
    bool SandboxMode,
    string? TestRecipientOverride,
    string EnvironmentLabel);

public sealed record CommunicationBatchDto(
    Guid Id,
    Guid ConvocationId,
    string Status,
    int TotalCount,
    int SentCount,
    int DeliveredCount,
    int FailedCount,
    int SkippedCount,
    DateTimeOffset? StartedAtUtc,
    DateTimeOffset? CompletedAtUtc);

public sealed record DeliveryDto(
    Guid Id,
    Guid RecipientId,
    string Channel,
    string Status,
    string? Destination,
    bool WasRedirectedToTestOverride,
    string? ProviderType,
    string? ProviderMessageId,
    string? ErrorDetail,
    DateTimeOffset? SentAtUtc,
    DateTimeOffset? DeliveredAtUtc);

public sealed record PortalNotificationDto(
    Guid Id,
    string Title,
    string Body,
    bool IsRead,
    DateTimeOffset CreatedAtUtc,
    Guid? ConvocationId);
