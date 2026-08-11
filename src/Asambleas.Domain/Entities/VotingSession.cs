namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;

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
    public string ResultVisibilityPolicy { get; set; } = ResultVisibility.HiddenUntilClose;

    public Guid? OpenedByUserId { get; set; }

    /// <summary>Eligible voter count frozen at open.</summary>
    public int EligibleVoters { get; set; }

    /// <summary>Sum of eligible coefficients frozen at open.</summary>
    public decimal EligibleCoefficient { get; set; }

    /// <summary>Decision rule code frozen at open (also refreshed at close).</summary>
    public string? AppliedDecisionRule { get; set; }

    /// <summary>Motion decision status snapshot at close (Approved/Rejected).</summary>
    public string? DecisionStatus { get; set; }

    /// <summary>Threshold % frozen at open for qualified majority.</summary>
    public decimal? RequiredThresholdPercent { get; set; }

    public string CalculationMethod { get; set; } = VotingDesignCodes.Calculation.Coefficient;

    public string BallotKind { get; set; } = VotingDesignCodes.Ballot.FavorAgainstAbstain;

    /// <summary>JSON snapshot of question/options/rule at open (immutability for history).</summary>
    public string? RuleSnapshotJson { get; set; }

    public string? CancellationReason { get; set; }

    public DateTimeOffset? CancelledAtUtc { get; set; }

    public Guid? CancelledByUserId { get; set; }

    /// <summary>First session in the version chain (self when VersionNumber == 1).</summary>
    public Guid? RootVotingSessionId { get; set; }

    public Guid? PreviousVotingSessionId { get; set; }

    public int VersionNumber { get; set; } = 1;

    /// <summary>Optimistic concurrency token (changed on every write).</summary>
    public Guid ConcurrencyStamp { get; set; } = Guid.NewGuid();
}
