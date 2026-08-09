using Asambleas.Application.Meeting;
using Asambleas.Application.Security;
using FluentAssertions;

namespace Asambleas.UnitTests.Meeting;

public sealed class MeetingPublishGrantTests
{
    [Theory]
    [InlineData(Roles.AssemblyPresident, true)]
    [InlineData(Roles.AssemblySecretary, true)]
    [InlineData(Roles.AssemblyOperator, true)]
    [InlineData(Roles.Owner, false)]
    [InlineData(Roles.Auditor, false)]
    public void CanPublishFromRole_is_server_derived(string role, bool expected) =>
        MeetingService.CanPublishFromRole(role).Should().Be(expected);

    [Fact]
    public void Default_token_ttl_is_short_lived() =>
        MeetingService.DefaultTokenTtl.Should().Be(TimeSpan.FromMinutes(15));
}
