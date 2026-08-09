namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class ChannelConfiguration : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public CommunicationChannel Channel { get; set; }

    public CommunicationProviderType ProviderType { get; set; } = CommunicationProviderType.Mock;

    public bool IsEnabled { get; set; }

    /// <summary>Non-secret provider settings (host, port, from address, etc.) as JSON.</summary>
    public string SettingsJson { get; set; } = "{}";

    /// <summary>True when a secret payload exists (password/token). Never exposes value.</summary>
    public bool HasSecret { get; set; }

    public string? SecretCiphertext { get; set; }

    public DateTimeOffset? LastTestedAtUtc { get; set; }

    public bool? LastTestSucceeded { get; set; }

    public string? LastTestDetail { get; set; }
}
