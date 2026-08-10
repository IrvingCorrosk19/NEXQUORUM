namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

/// <summary>
/// Horizontal property (PH). Demo seed name: "PH DEMO OCEAN TOWER".
/// </summary>
public class PropertyHorizontal : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid OrganizationId { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string? LegalName { get; set; }

    public string? Country { get; set; }

    public string? StateProvince { get; set; }

    public string? City { get; set; }

    public string? Address { get; set; }

    public string TimeZoneId { get; set; } = "America/Bogota";

    public string? AdminEmail { get; set; }

    public string? Phone { get; set; }

    public PhLifecycleStatus Status { get; set; } = PhLifecycleStatus.Draft;

    /// <summary>Wizard step 1–8 (onboarding progress).</summary>
    public int OnboardingStep { get; set; } = 1;
}
