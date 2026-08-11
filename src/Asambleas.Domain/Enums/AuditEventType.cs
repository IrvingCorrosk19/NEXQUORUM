namespace Asambleas.Domain.Enums;

/// <summary>
/// Canonical audit event type constants persisted on <c>AuditEvent.EventType</c>.
/// </summary>
public static class AuditEventType
{
    public const string Login = "LOGIN";
    public const string AssemblyJoin = "ASSEMBLY_JOIN";
    public const string CheckIn = "CHECK_IN";
    public const string ParticipantAccredited = "PARTICIPANT_ACCREDITED";
    public const string ParticipantRejected = "PARTICIPANT_REJECTED";
    public const string ParticipantLeft = "PARTICIPANT_LEFT";
    public const string ParticipantReturned = "PARTICIPANT_RETURNED";
    public const string PowerCreated = "POWER_CREATED";
    public const string PowerApproved = "POWER_APPROVED";
    public const string PowerRejected = "POWER_REJECTED";
    public const string PowerRevoked = "POWER_REVOKED";
    public const string RepresentationAssigned = "REPRESENTATION_ASSIGNED";
    public const string RepresentationChanged = "REPRESENTATION_CHANGED";
    public const string QuorumReached = "QUORUM_REACHED";
    public const string QuorumLost = "QUORUM_LOST";
    public const string AssemblyStarted = "ASSEMBLY_STARTED";
    public const string AssemblyPaused = "ASSEMBLY_PAUSED";
    public const string AssemblyResumed = "ASSEMBLY_RESUMED";
    public const string ParticipantConnected = "PARTICIPANT_CONNECTED";
    public const string ParticipantDisconnected = "PARTICIPANT_DISCONNECTED";
    public const string QuorumChanged = "QUORUM_CHANGED";
    public const string AgendaChanged = "AGENDA_CHANGED";
    public const string SpeakerRequested = "SPEAKER_REQUESTED";
    public const string SpeakerGranted = "SPEAKER_GRANTED";
    public const string SpeakerRejected = "SPEAKER_REJECTED";
    public const string SpeakerSkipped = "SPEAKER_SKIPPED";
    public const string SpeakerCancelled = "SPEAKER_CANCELLED";
    public const string MotionPresented = "MOTION_PRESENTED";
    public const string MotionCreated = "MOTION_CREATED";
    public const string MotionUpdated = "MOTION_UPDATED";
    public const string MotionPublished = "MOTION_PUBLISHED";
    public const string VotingOpened = "VOTING_OPENED";
    public const string VoteCast = "VOTE_CAST";
    public const string VoteAccepted = "VOTE_ACCEPTED";
    public const string VotingClosed = "VOTING_CLOSED";
    public const string ResultCalculated = "RESULT_CALCULATED";
    public const string DecisionCreated = "DECISION_CREATED";
    public const string VotingEdited = "VOTING_EDITED";
    public const string VotingLocked = "VOTING_LOCKED";
    public const string VotingCancelled = "VOTING_CANCELLED";
    public const string VotingVersionCreated = "VOTING_VERSION_CREATED";
    public const string VotingWithdrawn = "VOTING_WITHDRAWN";
    public const string FirstBallotAccepted = "FIRST_BALLOT_ACCEPTED";
    public const string FormCreated = "FORM_CREATED";
    public const string FormPublished = "FORM_PUBLISHED";
    public const string FormClosed = "FORM_CLOSED";
    public const string FormResponseSubmitted = "FORM_RESPONSE_SUBMITTED";
    public const string AssemblyCompleted = "ASSEMBLY_COMPLETED";
    public const string AssemblyCreated = "ASSEMBLY_CREATED";
    public const string AssemblyScheduled = "ASSEMBLY_SCHEDULED";
    public const string AssemblyRescheduled = "ASSEMBLY_RESCHEDULED";
    public const string AssemblyCancelled = "ASSEMBLY_CANCELLED";

    public const string RecordingStarted = "RECORDING_STARTED";
    public const string RecordingStopped = "RECORDING_STOPPED";
    public const string RecordingReady = "RECORDING_READY";
    public const string RecordingFailed = "RECORDING_FAILED";
    public const string RecordingNoticeAccepted = "RECORDING_NOTICE_ACCEPTED";
    public const string RecordingViewed = "RECORDING_VIEWED";
    public const string RecordingDownloaded = "RECORDING_DOWNLOADED";
    public const string EvidencePackageGenerated = "EVIDENCE_PACKAGE_GENERATED";
    public const string EvidencePackageDownloaded = "EVIDENCE_PACKAGE_DOWNLOADED";

    public const string PhCreated = "PH_CREATED";
    public const string PhUpdated = "PH_UPDATED";
    public const string PhDeactivated = "PH_DEACTIVATED";
    public const string PhReactivated = "PH_REACTIVATED";
    public const string PhDeleted = "PH_DELETED";

    public const string OwnerCreated = "OWNER_CREATED";
    public const string OwnerUpdated = "OWNER_UPDATED";
    public const string OwnerDeactivated = "OWNER_DEACTIVATED";
    public const string OwnerReactivated = "OWNER_REACTIVATED";
    public const string OwnerDeleted = "OWNER_DELETED";
    public const string OwnershipChanged = "OWNERSHIP_CHANGED";
}
