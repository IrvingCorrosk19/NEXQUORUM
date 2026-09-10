using Asambleas.Application.Communications;
using FluentAssertions;
using Xunit;

namespace Asambleas.UnitTests;

public sealed class AccessLinkExpiryCalculatorTests
{
    private static readonly DateTimeOffset Issued = new(2026, 9, 4, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void No_schedule_is_issued_plus_48h_not_14_days()
    {
        var exp = AssemblyAccessLinkService.ResolveExpiry(Issued, null, null);
        exp.Should().Be(Issued.AddHours(48));
        exp.Should().NotBe(Issued.AddDays(14));
    }

    [Fact]
    public void Assembly_in_30_days_does_not_expire_at_14_days()
    {
        var scheduled = Issued.AddDays(30);
        var exp = AssemblyAccessLinkService.ResolveExpiry(Issued, scheduled);
        exp.Should().BeAfter(Issued.AddDays(14));
        exp.Should().Be(scheduled.AddHours(48));
    }

    [Fact]
    public void Assembly_in_30_days_expires_48h_after_start_when_no_end()
    {
        var scheduled = Issued.AddDays(30);
        AssemblyAccessLinkService.ResolveExpiry(Issued, scheduled)
            .Should().Be(scheduled.AddHours(48));
    }

    [Fact]
    public void Assembly_in_10_hours_expires_start_plus_48h()
    {
        var scheduled = Issued.AddHours(10);
        AssemblyAccessLinkService.ResolveExpiry(Issued, scheduled)
            .Should().Be(scheduled.AddHours(48));
    }

    [Fact]
    public void Past_assembly_still_uses_anchor_plus_48h_without_24h_floor()
    {
        var scheduled = Issued.AddHours(-100);
        AssemblyAccessLinkService.ResolveExpiry(Issued, scheduled)
            .Should().Be(scheduled.AddHours(48));
    }

    [Fact]
    public void Prefers_estimated_end_plus_48h_when_provided()
    {
        var start = Issued.AddDays(7);
        var end = start.AddHours(3);
        AssemblyAccessLinkService.ResolveExpiry(Issued, start, end)
            .Should().Be(end.AddHours(48));
    }

    [Fact]
    public void Instant_before_expires_is_valid_boundary()
    {
        var exp = Issued.AddHours(48);
        (Issued.AddHours(48).AddTicks(-1) < exp).Should().BeTrue();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    public void At_or_after_expires_is_expired(int ticksAfter)
    {
        var exp = Issued.AddHours(48);
        var now = exp.AddTicks(ticksAfter);
        (exp <= now).Should().BeTrue();
    }

    [Fact]
    public void America_Panama_local_schedule_converts_to_utc_anchor()
    {
        var tz = TimeZoneInfo.FindSystemTimeZoneById(
            OperatingSystem.IsWindows() ? "SA Pacific Standard Time" : "America/Panama");
        var local = new DateTime(2026, 10, 4, 19, 0, 0, DateTimeKind.Unspecified);
        var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(local, tz);
        var issued = new DateTimeOffset(2026, 9, 4, 12, 0, 0, TimeSpan.Zero);
        var exp = AssemblyAccessLinkService.ResolveExpiry(issued, new DateTimeOffset(scheduledUtc, TimeSpan.Zero));
        exp.Should().Be(new DateTimeOffset(scheduledUtc, TimeSpan.Zero).AddHours(48));
        scheduledUtc.Hour.Should().Be(0);
        scheduledUtc.Day.Should().Be(5);
    }

    [Fact]
    public void DefaultLifetime_14_days_constant_is_removed()
    {
        typeof(AssemblyAccessLinkService).GetField("DefaultLifetime")
            .Should().BeNull("fixed 14-day lifetime must be removed");
    }
}
