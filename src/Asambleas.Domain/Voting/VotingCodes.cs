namespace Asambleas.Domain.Voting;

/// <summary>Stable voting/eligibility codes for API ProblemDetails extensions.</summary>
public static class VotingCodes
{
    public const string Eligible = "ELIGIBLE";
    public const string AlreadyVoted = "ALREADY_VOTED";
    public const string NotAccredited = "NOT_ACCREDITED";
    public const string NotEligible = "NOT_ELIGIBLE";
    public const string NotParticipant = "NOT_PARTICIPANT";
    public const string VotingClosed = "VOTING_CLOSED";
    public const string VotingNotOpen = "VOTING_NOT_OPEN";
    public const string AssemblyNotActive = "ASSEMBLY_NOT_ACTIVE";
    public const string AssemblyClosed = "ASSEMBLY_CLOSED";
    public const string InvalidChoice = "INVALID_CHOICE";
    public const string InvalidUnit = "INVALID_UNIT";
    public const string SessionNotFound = "SESSION_NOT_FOUND";
    public const string OpenVotingExists = "OPEN_VOTING_EXISTS";
    public const string MotionInvalid = "MOTION_INVALID";
    public const string ConflictChoice = "VOTE_CHOICE_CONFLICT";
}
