namespace Asambleas.Application.Security;

public static class Permissions
{
    public const string AssemblyView = "assembly:view";
    public const string AssemblyManage = "assembly:manage";
    public const string AssemblyStart = "assembly:start";
    public const string AssemblyClose = "assembly:close";

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

    public const string CommunicationsView = "communications:view";
    public const string CommunicationsConfigure = "communications:configure";
    public const string CommunicationsTest = "communications:test";
    public const string TemplatesView = "templates:view";
    public const string TemplatesManage = "templates:manage";
    public const string ConvocationsCreate = "convocations:create";
    public const string ConvocationsSend = "convocations:send";
    public const string ConvocationsResend = "convocations:resend";
    public const string ConvocationsViewEvidence = "convocations:view-evidence";

    public static IReadOnlyList<string> All { get; } =
    [
        AssemblyView,
        AssemblyManage,
        AssemblyStart,
        AssemblyClose,
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
        CommunicationsView,
        CommunicationsConfigure,
        CommunicationsTest,
        TemplatesView,
        TemplatesManage,
        ConvocationsCreate,
        ConvocationsSend,
        ConvocationsResend,
        ConvocationsViewEvidence
    ];
}
