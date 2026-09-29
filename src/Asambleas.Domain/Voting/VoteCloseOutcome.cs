namespace Asambleas.Domain.Voting;

using Asambleas.Domain.Enums;

/// <summary>
/// Close-time outcome. Quorum is checked before the vote rule.
/// The display sentence is the recorded cause.
/// </summary>
public sealed record VoteCloseOutcome(
    MotionStatus MotionStatus,
    string DecisionStatus,
    string Headline,
    string Cause,
    bool QuorumReached)
{
    public const string ApprovedCause = "Alcanzó los votos requeridos";
    public const string RejectedCause = "No alcanzó los votos requeridos";
    public const string QuorumCause = "Quórum insuficiente";

    public string Display => $"{Headline} — {Cause}";

    public static VoteCloseOutcome Resolve(bool quorumReached, MotionStatus voteDecision)
    {
        if (!quorumReached)
        {
            return new(
                MotionStatus.NoValidDecision,
                nameof(MotionStatus.NoValidDecision),
                "Sin decisión válida",
                QuorumCause,
                false);
        }

        if (voteDecision == MotionStatus.Approved)
        {
            return new(
                MotionStatus.Approved,
                nameof(MotionStatus.Approved),
                "Aprobada",
                ApprovedCause,
                true);
        }

        return new(
            MotionStatus.Rejected,
            nameof(MotionStatus.Rejected),
            "Rechazada",
            RejectedCause,
            true);
    }

    public static string? DisplayForStatus(string? decisionStatus)
    {
        if (string.Equals(decisionStatus, nameof(MotionStatus.Approved), StringComparison.OrdinalIgnoreCase))
        {
            return $"Aprobada — {ApprovedCause}";
        }

        if (string.Equals(decisionStatus, nameof(MotionStatus.Rejected), StringComparison.OrdinalIgnoreCase))
        {
            return $"Rechazada — {RejectedCause}";
        }

        if (string.Equals(decisionStatus, nameof(MotionStatus.NoValidDecision), StringComparison.OrdinalIgnoreCase))
        {
            return $"Sin decisión válida — {QuorumCause}";
        }

        return null;
    }
}
