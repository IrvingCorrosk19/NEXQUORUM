namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class VotingSession : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid MotionId { get; set; }

    public VotingSessionStatus Status { get; set; } = VotingSessionStatus.Draft;

    public DateTimeOffset? OpenedAtUtc { get; set; }

    public DateTimeOffset? ClosedAtUtc { get; set; }

    public bool HidePartialResults { get; set; } = true;

    /// <summary>Wire name of <see cref="Enums.ResultVisibilityPolicy"/> (snapshot at open).</summary>
    public string ResultVisibilityPolicy { get; set; } = Voting.ResultVisibility.HiddenUntilClose;

    public Guid? OpenedByUserId { get; set; }

    /// <summary>Eligible voter count frozen at open.</summary>
    public int EligibleVoters { get; set; }

    /// <summary>Sum of eligible coefficients frozen at open.</summary>
    public decimal EligibleCoefficient { get; set; }

    /// <summary>Decision rule code frozen at open (also refreshed at close).</summary>
    public string? AppliedDecisionRule { get; set; }

    /// <summary>Motion decision status snapshot at close (Approved/Rejected).</summary>
    public string? DecisionStatus { get; set; }
}
