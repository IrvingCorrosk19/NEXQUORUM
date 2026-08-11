namespace Asambleas.Domain.Voting;

/// <summary>Wire codes for Voting &amp; Forms Studio configuration (snapshotted at open).</summary>
public static class VotingDesignCodes
{
    public static class Instrument
    {
        public const string FormalVote = "FormalVote";
        public const string Survey = "Survey";
    }

    public static class Ballot
    {
        public const string FavorAgainstAbstain = "FavorAgainstAbstain";
        public const string YesNo = "YesNo";
        public const string YesNoAbstain = "YesNoAbstain";
        public const string SingleChoice = "SingleChoice";
        public const string MultiCandidate = "MultiCandidate";
        public const string Scale = "Scale";
        public const string OpenText = "OpenText";
        public const string MultipleChoice = "MultipleChoice";
    }

    public static class Calculation
    {
        public const string Coefficient = "Coefficient";
        public const string PerPerson = "PerPerson";
        public const string PerUnit = "PerUnit";
    }

    public static class DesignStatus
    {
        public const string Draft = "Draft";
        public const string Ready = "Ready";
        public const string Archived = "Archived";
    }
}
