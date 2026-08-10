namespace Asambleas.Application.Security;

public static class Permissions
{
    public const string AssemblyView = "assembly:view";
    public const string AssemblyManage = "assembly:manage";
    public const string AssemblyStart = "assembly:start";
    public const string AssemblyClose = "assembly:close";
    public const string AssemblySchedule = "assembly:schedule";
    public const string AssemblyReschedule = "assembly:reschedule";
    public const string AssemblyCancel = "assembly:cancel";
    public const string CalendarView = "calendar:view";

    public const string AttendanceView = "attendance:view";
    public const string AttendanceManage = "attendance:manage";

    public const string QuorumView = "quorum:view";

    public const string AgendaView = "agenda:view";
    public const string AgendaManage = "agenda:manage";

    public const string MotionCreate = "motion:create";
    public const string MotionView = "motion:view";

    public const string VoteView = "vote:view";
    public const string VoteOpen = "vote:open";
    public const string VoteCast = "vote:cast";
    public const string VoteClose = "vote:close";
    public const string VoteResults = "vote:results";

    public const string MeetingJoin = "meeting:join";
    public const string MeetingModerate = "meeting:moderate";

    public const string AuditView = "audit:view";

    public const string RecordingControl = "recording:control";
    public const string RecordingView = "recording:view";
    public const string RecordingDownload = "recording:download";
    public const string ExpedienteView = "expediente:view";
    public const string ExpedienteDownload = "expediente:download";

    public const string CommunicationsView = "communications:view";
    public const string CommunicationsConfigure = "communications:configure";
    public const string CommunicationsTest = "communications:test";
    public const string TemplatesView = "templates:view";
    public const string TemplatesManage = "templates:manage";
    public const string ConvocationsCreate = "convocations:create";
    public const string ConvocationsSend = "convocations:send";
    public const string ConvocationsResend = "convocations:resend";
    public const string ConvocationsViewEvidence = "convocations:view-evidence";

    public const string PhView = "ph:view";
    public const string PhManage = "ph:manage";
    public const string UnitView = "unit:view";
    public const string UnitManage = "unit:manage";
    public const string OwnerView = "owner:view";
    public const string OwnerManage = "owner:manage";
    public const string OwnerInvite = "owner:invite";
    public const string PhImport = "ph:import";

    public static IReadOnlyList<string> All { get; } =
    [
        AssemblyView,
        AssemblyManage,
        AssemblyStart,
        AssemblyClose,
        AssemblySchedule,
        AssemblyReschedule,
        AssemblyCancel,
        CalendarView,
        AttendanceView,
        AttendanceManage,
        QuorumView,
        AgendaView,
        AgendaManage,
        MotionCreate,
        MotionView,
        VoteView,
        VoteOpen,
        VoteCast,
        VoteClose,
        VoteResults,
        MeetingJoin,
        MeetingModerate,
        AuditView,
        RecordingControl,
        RecordingView,
        RecordingDownload,
        ExpedienteView,
        ExpedienteDownload,
        CommunicationsView,
        CommunicationsConfigure,
        CommunicationsTest,
        TemplatesView,
        TemplatesManage,
        ConvocationsCreate,
        ConvocationsSend,
        ConvocationsResend,
        ConvocationsViewEvidence,
        PhView,
        PhManage,
        UnitView,
        UnitManage,
        OwnerView,
        OwnerManage,
        OwnerInvite,
        PhImport
    ];
}
