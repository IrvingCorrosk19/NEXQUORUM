namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Horizontal property (PH). Demo seed name: "PH DEMO OCEAN TOWER".
/// </summary>
public class PropertyHorizontal : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid OrganizationId { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string TimeZoneId { get; set; } = "America/Bogota";
}
