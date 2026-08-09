namespace Asambleas.Application.Security;

public static class RolePermissionMap
{
    private static readonly IReadOnlyDictionary<string, IReadOnlySet<string>> Map =
        new Dictionary<string, IReadOnlySet<string>>(StringComparer.OrdinalIgnoreCase)
        {
            [Roles.PlatformAdmin] = new HashSet<string>(Permissions.All, StringComparer.Ordinal),
            [Roles.TenantAdmin] = new HashSet<string>(Permissions.All, StringComparer.Ordinal),
            [Roles.PHAdmin] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.AssemblyManage,
                Permissions.AssemblyStart,
                Permissions.AssemblyClose,
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
                Permissions.AuditView
            ], StringComparer.Ordinal),
            [Roles.AssemblyPresident] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.AssemblyManage,
                Permissions.AssemblyStart,
                Permissions.AssemblyClose,
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
                Permissions.AuditView
            ], StringComparer.Ordinal),
            [Roles.AssemblySecretary] = new HashSet<string>(
            [
                Permissions.AssemblyView,
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
                Permissions.AuditView
            ], StringComparer.Ordinal),
            [Roles.AssemblyOperator] = new HashSet<string>(
            [
                Permissions.AssemblyView,
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
                Permissions.MeetingModerate
            ], StringComparer.Ordinal),
            [Roles.Owner] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.AttendanceView,
                Permissions.QuorumView,
                Permissions.AgendaView,
                Permissions.MotionView,
                Permissions.VoteView,
                Permissions.VoteCast,
                Permissions.VoteResults,
                Permissions.MeetingJoin
            ], StringComparer.Ordinal),
            [Roles.Auditor] = new HashSet<string>(
            [
                Permissions.AssemblyView,
                Permissions.AttendanceView,
                Permissions.QuorumView,
                Permissions.AgendaView,
                Permissions.MotionView,
                Permissions.VoteView,
                Permissions.VoteResults,
                Permissions.AuditView
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
