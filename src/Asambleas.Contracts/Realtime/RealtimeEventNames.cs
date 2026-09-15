namespace Asambleas.Contracts.Realtime;

/// <summary>
/// SignalR client event names for assembly-room projections (ADR-004).
/// </summary>
public static class RealtimeEventNames
{
    public const string AssemblyStatusChanged = "assemblyStatusChanged";
    public const string AssemblyScheduleChanged = "assemblyScheduleChanged";
    public const string ParticipantUpdated = "participantUpdated";
    /// <summary>Owner-facing accreditation lifecycle (approved / revoked) with a clear message.</summary>
    public const string AccreditationChanged = "accreditationChanged";
    public const string QuorumUpdated = "quorumUpdated";
    public const string AgendaUpdated = "agendaUpdated";
    public const string SpeakerQueueUpdated = "speakerQueueUpdated";
    public const string MotionUpdated = "motionUpdated";
    public const string VotingOpened = "votingOpened";
    public const string VoteTallyUpdated = "voteTallyUpdated";
    public const string VotingClosed = "votingClosed";
    public const string VotingCancelled = "votingCancelled";
    public const string VotingVersionCreated = "votingVersionCreated";
    public const string AuditAppended = "auditAppended";
    public const string RecordingUpdated = "recordingUpdated";
    public const string ScreenShareUpdated = "screenShareUpdated";
    /// <summary>President/admin asks an absent participant to join the room now.</summary>
    public const string JoinSummonRequested = "joinSummonRequested";
    public const string JoinSummonStatusChanged = "joinSummonStatusChanged";
    public const string RoomEntryChanged = "roomEntryChanged";
    public const string DeviceActivationRequested = "deviceActivationRequested";
    public const string ChatMessageAppended = "chatMessageAppended";
    public const string ChatMessageRemoved = "chatMessageRemoved";
}
