namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Owner ↔ Unit relation. Supports N:N. Historical rows stay with IsActive=false.
/// Unit coefficient lives on <see cref="Unit"/>; SharePercent is ownership share of that unit.
/// </summary>
public class Ownership : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid UnitId { get; set; }

    public Guid OwnerId { get; set; }

    /// <summary>Share of the unit (typically 100 for sole owner). Not the PH coefficient.</summary>
    public decimal SharePercent { get; set; }

    public DateTimeOffset EffectiveFromUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? EffectiveToUtc { get; set; }

    public bool IsActive { get; set; } = true;
}
