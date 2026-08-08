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

    /// <summary>Rule code applied at close (snapshot).</summary>
    public string? AppliedDecisionRule { get; set; }

    /// <summary>Motion decision status snapshot at close (Approved/Rejected).</summary>
    public string? DecisionStatus { get; set; }
}
