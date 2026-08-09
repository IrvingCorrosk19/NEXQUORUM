namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>Tenant/PH communication profile: sandbox, overrides, defaults.</summary>
public class CommunicationProfile : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public bool SandboxMode { get; set; } = true;

    /// <summary>When set in non-production, all external deliveries redirect here.</summary>
    public string? TestRecipientOverride { get; set; }

    public string DefaultTimezoneId { get; set; } = "America/Panama";

    public string? DefaultFromDisplayName { get; set; }

    public string? DefaultReplyTo { get; set; }
}
