namespace Asambleas.Application.Security;

public static class RolePermissionMap
{
    private static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> Map =
        new Dictionary<string, IReadOnlySet<string>>(StringComparer.OrdinalIgnoreCase)
        {
            [Roles.PlatformAdmin] = new HashSet<string>(Permissions.All, StringComparer.Ordinal),
            [Roles.TenantAdmin] = new HashSet<string>(Permissions.All, StringComparer.Ordinal),

            // PH administration (owners/units/SMTP/import) — NOT automatic voting rights.
            [Roles.PHAdmin] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.AssemblyManage,
                Permissions.AssemblyStart,
                Permissions.AssemblyClose,
                Permissions.AssemblySchedule,
                Permissions.AssemblyReschedule,
                Permissions.AssemblyCancel,
                Permissions.CalendarView,
                Permissions.AttendanceView,
                Permissions.AttendanceManage,
                Permissions.QuorumView,
                Permissions.AgendaView,
                Permissions.AgendaManage,
                Permissions.MotionCreate,
                Permissions.MotionView,
                Permissions.VoteView,
                Permissions.VoteOpen,
                Permissions.VoteClose,
                Permissions.VoteResults,
                Permissions.MeetingJoin,
                Permissions.MeetingModerate,
                Permissions.MeetingScreenShare,
                Permissions.AuditView,
                Permissions.RecordingControl,
                Permissions.RecordingView,
                Permissions.RecordingDownload,
                Permissions.ExpedienteView,
                Permissions.ExpedienteDownload,
                Permissions.CommunicationsView,
                Permissions.CommunicationsConfigure,
                Permissions.CommunicationsTest,
                Permissions.TemplatesView,
                Permissions.TemplatesManage,
                Permissions.ConvocationsCreate,
                Permissions.ConvocationsSend,
                Permissions.ConvocationsResend,
                Permissions.ConvocationsViewEvidence,
                Permissions.PhView,
                Permissions.PhManage,
                Permissions.UnitView,
                Permissions.UnitManage,
                Permissions.OwnerView,
                Permissions.OwnerManage,
                Permissions.OwnerInvite,
                Permissions.PhImport,
                Permissions.PortalSelf
            ], StringComparer.Ordinal),

            // Assembly authority — may configure SMTP/convocations; no owner CRUD, no vote:cast.
            [Roles.AssemblyPresident] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.AssemblyManage,
                Permissions.AssemblyStart,
                Permissions.AssemblyClose,
                Permissions.AssemblySchedule,
                Permissions.AssemblyReschedule,
                Permissions.AssemblyCancel,
                Permissions.CalendarView,
                Permissions.AttendanceView,
                Permissions.AttendanceManage,
                Permissions.QuorumView,
                Permissions.AgendaView,
                Permissions.AgendaManage,
                Permissions.MotionCreate,
                Permissions.MotionView,
                Permissions.VoteView,
                Permissions.VoteOpen,
                Permissions.VoteClose,
                Permissions.VoteResults,
                Permissions.MeetingJoin,
                Permissions.MeetingModerate,
                Permissions.MeetingScreenShare,
                Permissions.AuditView,
                Permissions.RecordingControl,
                Permissions.RecordingView,
                Permissions.RecordingDownload,
                Permissions.ExpedienteView,
                Permissions.ExpedienteDownload,
                Permissions.CommunicationsView,
                Permissions.CommunicationsConfigure,
                Permissions.CommunicationsTest,
                Permissions.TemplatesView,
                Permissions.TemplatesManage,
                Permissions.ConvocationsCreate,
                Permissions.ConvocationsSend,
                Permissions.ConvocationsResend,
                Permissions.ConvocationsViewEvidence,
                Permissions.PhView,
                // Allow bootstrap create of a new PH after empty/clean environments.
                // Per-PH admin of that new PH still comes from membership RoleHint=PHAdmin.
                Permissions.PhManage,
                Permissions.UnitView,
                Permissions.OwnerView,
                Permissions.PortalSelf
            ], StringComparer.Ordinal),

            [Roles.AssemblySecretary] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.CalendarView,
                Permissions.AttendanceView,
                Permissions.AttendanceManage,
                Permissions.QuorumView,
                Permissions.AgendaView,
                Permissions.AgendaManage,
                Permissions.MotionCreate,
                Permissions.MotionView,
                Permissions.VoteView,
                Permissions.VoteOpen,
                Permissions.VoteClose,
                Permissions.VoteResults,
                Permissions.MeetingJoin,
                Permissions.MeetingModerate,
                Permissions.MeetingScreenShare,
                Permissions.AuditView,
                Permissions.RecordingControl,
                Permissions.RecordingView,
                Permissions.RecordingDownload,
                Permissions.ExpedienteView,
                Permissions.ExpedienteDownload,
                Permissions.CommunicationsView,
                Permissions.CommunicationsTest,
                Permissions.TemplatesView,
                Permissions.TemplatesManage,
                Permissions.ConvocationsCreate,
                Permissions.ConvocationsSend,
                Permissions.ConvocationsResend,
                Permissions.ConvocationsViewEvidence,
                Permissions.PhView,
                Permissions.UnitView,
                Permissions.OwnerView,
                Permissions.PortalSelf
            ], StringComparer.Ordinal),

            [Roles.AssemblyOperator] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.CalendarView,
                Permissions.AttendanceView,
                Permissions.AttendanceManage,
                Permissions.QuorumView,
                Permissions.AgendaView,
                Permissions.AgendaManage,
                Permissions.MotionView,
                Permissions.VoteView,
                Permissions.VoteOpen,
                Permissions.VoteClose,
                Permissions.MeetingJoin,
                Permissions.MeetingModerate,
                Permissions.MeetingScreenShare,
                Permissions.RecordingControl,
                Permissions.RecordingView,
                Permissions.CommunicationsView,
                Permissions.ConvocationsCreate,
                Permissions.PhView,
                Permissions.UnitView,
                Permissions.OwnerView,
                Permissions.PortalSelf
            ], StringComparer.Ordinal),

            // Owner: participate only. No PH/SMTP/owner/unit admin. No communications config.
            [Roles.Owner] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.CalendarView,
                Permissions.AttendanceView,
                Permissions.QuorumView,
                Permissions.AgendaView,
                Permissions.MotionView,
                Permissions.VoteView,
                Permissions.VoteCast,
                Permissions.VoteResults,
                Permissions.MeetingJoin,
                Permissions.RecordingView,
                Permissions.ExpedienteView,
                Permissions.PortalSelf
            ], StringComparer.Ordinal),

            [Roles.Auditor] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.CalendarView,
                Permissions.AttendanceView,
                Permissions.QuorumView,
                Permissions.AgendaView,
                Permissions.MotionView,
                Permissions.VoteView,
                Permissions.VoteResults,
                Permissions.AuditView,
                Permissions.RecordingView,
                Permissions.RecordingDownload,
                Permissions.ExpedienteView,
                Permissions.ExpedienteDownload,
                Permissions.CommunicationsView,
                Permissions.ConvocationsViewEvidence,
                Permissions.PortalSelf
            ], StringComparer.Ordinal)
        };

    public static IReadOnlySet<string> GetPermissions(string role)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(role);

        return Map.TryGetValue(role, out var permissions)
            ? permissions
            : new HashSet<string>(StringComparer.Ordinal);
    }

    public static IReadOnlySet<string> GetPermissions(IEnumerable<string> roles)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var role in roles)
        {
            result.UnionWith(GetPermissions(role));
        }

        return result;
    }

    public static bool HasPermission(IEnumerable<string> roles, string permission)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(permission);
        return GetPermissions(roles).Contains(permission);
    }
}
