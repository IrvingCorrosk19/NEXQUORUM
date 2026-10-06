namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Weight frozen when the person became eligible. Rows for an open vote follow who is
/// connected, except a person who already voted: that row and the ballot stay if they leave.
/// Closed sessions are never rewritten from later presence changes.
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
