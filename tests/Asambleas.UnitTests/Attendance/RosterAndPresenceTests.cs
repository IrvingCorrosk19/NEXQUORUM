using Asambleas.Application.Attendance;
using Asambleas.Domain.Enums;

namespace Asambleas.UnitTests.Attendance;

public sealed class RosterAndPresenceTests
{
    [Fact]
    public void Shared_unit_counts_once_and_extra_units_are_kept()
    {
        var codes = ConvokedUnitRoster.DistinctCodes(
        [
            ["201", "202", "203"],
            ["201"],
            [" 203 ", ""]
        ]);

        Assert.Equal(["201", "202", "203"], codes);
    }

    [Fact]
    public void Visiting_after_leave_does_not_restore_presence()
    {
        var stamp = DateTimeOffset.Parse("2026-11-22T20:00:00Z");
        Assert.False(PresenceJoinPolicy.AllowsPresent(
            AttendanceStatus.Left,
            explicitRoomEntry: false,
            stamp,
            stamp));
    }

    [Fact]
    public void Explicit_reentry_restores_presence_until_a_later_leave()
    {
        var leftAt = DateTimeOffset.Parse("2026-11-22T20:00:00Z");
        Assert.True(PresenceJoinPolicy.AllowsPresent(
            AttendanceStatus.Left,
            explicitRoomEntry: true,
            leftAt,
            leftAt));

        var laterLeave = leftAt.AddSeconds(2);
        Assert.False(PresenceJoinPolicy.AllowsPresent(
            AttendanceStatus.Left,
            explicitRoomEntry: true,
            leftAt,
            laterLeave));
    }

    [Fact]
    public void Reconnect_while_present_is_allowed()
    {
        var stamp = DateTimeOffset.Parse("2026-11-22T20:00:00Z");
        Assert.True(PresenceJoinPolicy.AllowsPresent(
            AttendanceStatus.TemporarilyDisconnected,
            explicitRoomEntry: false,
            stamp,
            stamp));
    }
}
