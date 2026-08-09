namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class ConvocationRecipient : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid ConvocationId { get; set; }

    public Guid? OwnerId { get; set; }

    public Guid? UserId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? PhoneE164 { get; set; }

    /// <summary>JSON array of channels intended for this recipient.</summary>
    public string ChannelsJson { get; set; } = "[]";

    public bool IsValid { get; set; } = true;

    public string? ValidationIssuesJson { get; set; }
}
