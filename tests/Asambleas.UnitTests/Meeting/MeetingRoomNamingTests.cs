using Asambleas.Application.Meeting;
using FluentAssertions;

namespace Asambleas.UnitTests.Meeting;

public sealed class MeetingRoomNamingTests
{
    [Fact]
    public void CanonicalRoomName_is_stable_and_role_independent()
    {
        var id = Guid.Parse("768822c2-e34c-446e-9b02-78e8c157dca8");
        MeetingService.CanonicalRoomName(id).Should().Be("assembly-768822c2e34c446e9b0278e8c157dca8");
        MeetingService.CanonicalRoomName(id).Should().Be(MeetingService.CanonicalRoomName(id));
    }

    [Fact]
    public void CanonicalRoomName_isolates_assemblies()
    {
        var a = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var b = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        MeetingService.CanonicalRoomName(a).Should().NotBe(MeetingService.CanonicalRoomName(b));
    }

    [Fact]
    public void Participant_identity_is_unique_per_connection_but_same_user_base()
    {
        var user = Guid.Parse("77777777-7777-7777-7777-777777777101");
        var a = MeetingService.BuildParticipantIdentity(user, "aaaabbbb");
        var b = MeetingService.BuildParticipantIdentity(user, "ccccdddd");
        a.Should().NotBe(b);
        MeetingService.BaseParticipantIdentity(a).Should().Be(user.ToString("N"));
        MeetingService.BaseParticipantIdentity(b).Should().Be(user.ToString("N"));
        MeetingService.BaseParticipantIdentity(user.ToString("N")).Should().Be(user.ToString("N"));
    }
}
