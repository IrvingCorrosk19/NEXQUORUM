namespace Asambleas.Application.Assembly;

using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Domain.Enums;

public static class AssemblyRoomRules
{
    public static string ResolveViewerRole(string? roleCode)
    {
        if (string.Equals(roleCode, Roles.Auditor, StringComparison.OrdinalIgnoreCase))
        {
            return AssemblyViewerRoles.Auditor;
        }

        if (string.Equals(roleCode, Roles.AssemblyPresident, StringComparison.OrdinalIgnoreCase)
            || string.Equals(roleCode, Roles.AssemblySecretary, StringComparison.OrdinalIgnoreCase)
            || string.Equals(roleCode, Roles.AssemblyOperator, StringComparison.OrdinalIgnoreCase)
            || string.Equals(roleCode, Roles.PHAdmin, StringComparison.OrdinalIgnoreCase)
            || string.Equals(roleCode, Roles.TenantAdmin, StringComparison.OrdinalIgnoreCase)
            || string.Equals(roleCode, Roles.PlatformAdmin, StringComparison.OrdinalIgnoreCase))
        {
            return AssemblyViewerRoles.Operator;
        }

        return AssemblyViewerRoles.Owner;
    }

    public static string ResolvePrimaryCta(string status) =>
        status switch
        {
            nameof(AssemblyStatus.Draft) => AssemblyPrimaryCtas.Prepare,
            nameof(AssemblyStatus.Scheduled) => AssemblyPrimaryCtas.StartCheckIn,
            nameof(AssemblyStatus.CheckIn) => AssemblyPrimaryCtas.StartAssembly,
            nameof(AssemblyStatus.InProgress) or nameof(AssemblyStatus.Paused) => AssemblyPrimaryCtas.Continue,
            nameof(AssemblyStatus.Completed) or nameof(AssemblyStatus.Cancelled) => AssemblyPrimaryCtas.ViewResults,
            _ => AssemblyPrimaryCtas.Prepare
        };
}
