namespace Asambleas.Contracts.Realtime;

/// <summary>
/// SignalR client event names for assembly-room projections (ADR-004).
/// </summary>
public static class RealtimeEventNames
{
    public const string AssemblyStatusChanged = "assemblyStatusChanged";
    public const string ParticipantUpdated = "participantUpdated";
    public const string QuorumUpdated = "quorumUpdated";
    public const string AgendaUpdated = "agendaUpdated";
    public const string SpeakerQueueUpdated = "speakerQueueUpdated";
    public const string MotionUpdated = "motionUpdated";
    public const string VotingOpened = "votingOpened";
    public const string VoteTallyUpdated = "voteTallyUpdated";
    public const string VotingClosed = "votingClosed";
    public const string AuditAppended = "auditAppended";
}
