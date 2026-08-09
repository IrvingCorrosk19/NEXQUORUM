namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Frozen eligibility + weight at voting open. Historical tallies must not drift
/// if later attendance or representation changes.
/// </summary>
public class VotingEligibilitySnapshot : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid VotingSessionId { get; set; }

    public Guid UserId { get; set; }

    public Guid? UnitId { get; set; }

    public decimal CoefficientPercent { get; set; }

    public string? UnitCode { get; set; }
}
