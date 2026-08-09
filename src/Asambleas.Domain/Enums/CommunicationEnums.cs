namespace Asambleas.Domain.Enums;

public enum CommunicationChannel
{
    Email = 1,
    WhatsApp = 2,
    Sms = 3,
    Portal = 4,
    Pdf = 5,
    Physical = 6
}

public enum CommunicationProviderType
{
    Mock = 0,
    Smtp = 1,
    MetaWhatsApp = 2,
    TwilioSms = 3,
    Portal = 4
}

public enum ConvocationStatus
{
    Draft = 0,
    Ready = 1,
    Approved = 2,
    Scheduled = 3,
    Sending = 4,
    Sent = 5,
    Partial = 6,
    Failed = 7,
    Cancelled = 8
}

/// <summary>SENT ≠ DELIVERED ≠ READ. Track each stage explicitly.</summary>
public enum DeliveryStatus
{
    Pending = 0,
    Queued = 1,
    Sent = 2,
    Delivered = 3,
    Failed = 4,
    Bounced = 5,
    Read = 6,
    DeadLetter = 7,
    Skipped = 8
}

public enum TemplateChannelScope
{
    Email = 1,
    WhatsApp = 2,
    Sms = 3,
    Portal = 4,
    Pdf = 5
}
