namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

/// <summary>
/// Assembly-scoped power / proxy: who may represent which unit under which authority.
/// </summary>
public class Power : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public Guid AssemblyId { get; set; }

    /// <summary>Owner granting representation (principal).</summary>
    public Guid PrincipalOwnerId { get; set; }

    /// <summary>User who may act for the unit.</summary>
    public Guid RepresentativeUserId { get; set; }

    public Guid UnitId { get; set; }

    public PowerStatus Status { get; set; } = PowerStatus.Draft;

    public string? EvidenceReference { get; set; }

    public DateTimeOffset? ValidatedAtUtc { get; set; }

    public Guid? ValidatedByUserId { get; set; }
}
