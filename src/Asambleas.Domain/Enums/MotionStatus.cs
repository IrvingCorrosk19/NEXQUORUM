namespace Asambleas.Domain.Enums;

public enum MotionStatus
{
    Draft = 0,
    Presented = 1,
    Voting = 2,
    Approved = 3,
    Rejected = 4,
    /// <summary>Voting was cancelled after ballots; superseded by a new version.</summary>
    Cancelled = 5
}
