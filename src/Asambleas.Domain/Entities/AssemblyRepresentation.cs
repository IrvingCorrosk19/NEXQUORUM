namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

/// <summary>
/// Effective unit representation frozen at accreditation for an assembly.
/// Unique active row per (AssemblyId, UnitId) — one unit never counted twice.
/// </summary>
public class AssemblyRepresentation : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid UnitId { get; set; }

    public Guid RepresentativeUserId { get; set; }

    public RepresentationSource Source { get; set; }

    public Guid? PowerId { get; set; }

    /// <summary>Coefficient copied from Unit at accreditation time.</summary>
    public decimal CoefficientSnapshot { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTimeOffset AccreditedAtUtc { get; set; }

    public Guid AccreditedByUserId { get; set; }
}
