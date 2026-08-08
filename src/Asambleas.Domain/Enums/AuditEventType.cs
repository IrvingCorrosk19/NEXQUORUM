namespace Asambleas.Domain.Enums;

/// <summary>
/// Canonical audit event type constants persisted on <c>AuditEvent.EventType</c>.
/// </summary>
public static class AuditEventType
{
    public const string Login = "LOGIN";
    public const string AssemblyJoin = "ASSEMBLY_JOIN";
    public const string CheckIn = "CHECK_IN";
    public const string AssemblyStarted = "ASSEMBLY_STARTED";
    public const string ParticipantConnected = "PARTICIPANT_CONNECTED";
    public const string ParticipantDisconnected = "PARTICIPANT_DISCONNECTED";
    public const string QuorumChanged = "QUORUM_CHANGED";
    public const string AgendaChanged = "AGENDA_CHANGED";
    public const string SpeakerRequested = "SPEAKER_REQUESTED";
    public const string SpeakerGranted = "SPEAKER_GRANTED";
    public const string SpeakerRejected = "SPEAKER_REJECTED";
    public const string SpeakerSkipped = "SPEAKER_SKIPPED";
    public const string MotionPresented = "MOTION_PRESENTED";
    public const string VotingOpened = "VOTING_OPENED";
    public const string VoteCast = "VOTE_CAST";
    public const string VotingClosed = "VOTING_CLOSED";
    public const string ResultCalculated = "RESULT_CALCULATED";
    public const string AssemblyCompleted = "ASSEMBLY_COMPLETED";
}
