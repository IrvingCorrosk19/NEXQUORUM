using Asambleas.Application.Security;
using FluentAssertions;

namespace Asambleas.UnitTests.Security;

public sealed class ForceAbsentPermissionTests
{
    [Theory]
    [InlineData(Roles.AssemblyPresident)]
    [InlineData(Roles.AssemblySecretary)]
    [InlineData(Roles.AssemblyOperator)]
    [InlineData(Roles.PHAdmin)]
    [InlineData(Roles.Owner)]
    [InlineData(Roles.Auditor)]
    public void Non_admin_roles_do_not_get_force_absent(string role)
    {
        RolePermissionMap.GetPermissions([role])
            .Should().NotContain(Permissions.AttendanceForceAbsent);
    }

    [Theory]
    [InlineData(Roles.PlatformAdmin)]
    [InlineData(Roles.TenantAdmin)]
    public void Admin_roles_get_force_absent(string role)
    {
        RolePermissionMap.GetPermissions([role])
            .Should().Contain(Permissions.AttendanceForceAbsent);
    }
}