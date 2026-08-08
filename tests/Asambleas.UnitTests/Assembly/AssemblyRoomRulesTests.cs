using Asambleas.Application.Assembly;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Domain.Enums;
using FluentAssertions;

namespace Asambleas.UnitTests.Assembly;

public sealed class AssemblyRoomRulesTests
{
    [Theory]
    [InlineData(Roles.AssemblyPresident, AssemblyViewerRoles.Operator)]
    [InlineData(Roles.AssemblySecretary, AssemblyViewerRoles.Operator)]
    [InlineData(Roles.AssemblyOperator, AssemblyViewerRoles.Operator)]
    [InlineData(Roles.Owner, AssemblyViewerRoles.Owner)]
    [InlineData(Roles.Auditor, AssemblyViewerRoles.Auditor)]
    public void ResolveViewerRole_maps_participant_role(string roleCode, string expected) =>
        AssemblyRoomRules.ResolveViewerRole(roleCode).Should().Be(expected);

    [Theory]
    [InlineData(nameof(AssemblyStatus.Draft), AssemblyPrimaryCtas.Prepare)]
    [InlineData(nameof(AssemblyStatus.Scheduled), AssemblyPrimaryCtas.StartCheckIn)]
    [InlineData(nameof(AssemblyStatus.CheckIn), AssemblyPrimaryCtas.StartAssembly)]
    [InlineData(nameof(AssemblyStatus.InProgress), AssemblyPrimaryCtas.Continue)]
    [InlineData(nameof(AssemblyStatus.Paused), AssemblyPrimaryCtas.Continue)]
    [InlineData(nameof(AssemblyStatus.Completed), AssemblyPrimaryCtas.ViewResults)]
    public void ResolvePrimaryCta_maps_status(string status, string expected) =>
        AssemblyRoomRules.ResolvePrimaryCta(status).Should().Be(expected);
}
