using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Services;
using FluentAssertions;

namespace Asambleas.UnitTests.Assembly;

public sealed class AssemblyLifecycleTests
{
    [Theory]
    [InlineData(AssemblyStatus.Draft, AssemblyStatus.Scheduled)]
    [InlineData(AssemblyStatus.Scheduled, AssemblyStatus.CheckIn)]
    [InlineData(AssemblyStatus.CheckIn, AssemblyStatus.InProgress)]
    [InlineData(AssemblyStatus.InProgress, AssemblyStatus.Paused)]
    [InlineData(AssemblyStatus.Paused, AssemblyStatus.InProgress)]
    [InlineData(AssemblyStatus.InProgress, AssemblyStatus.Completed)]
    [InlineData(AssemblyStatus.Paused, AssemblyStatus.Completed)]
    [InlineData(AssemblyStatus.Draft, AssemblyStatus.Cancelled)]
    [InlineData(AssemblyStatus.Scheduled, AssemblyStatus.Cancelled)]
    [InlineData(AssemblyStatus.CheckIn, AssemblyStatus.Cancelled)]
    public void Allows_valid_transitions(AssemblyStatus from, AssemblyStatus to)
    {
        AssemblyLifecycle.CanTransition(from, to).Should().BeTrue();
        AssemblyLifecycle.Transition(from, to).Should().Be(to);
    }

    [Theory]
    [InlineData(AssemblyStatus.Draft, AssemblyStatus.InProgress)]
    [InlineData(AssemblyStatus.Scheduled, AssemblyStatus.Completed)]
    [InlineData(AssemblyStatus.InProgress, AssemblyStatus.CheckIn)]
    [InlineData(AssemblyStatus.Completed, AssemblyStatus.InProgress)]
    [InlineData(AssemblyStatus.Cancelled, AssemblyStatus.Scheduled)]
    [InlineData(AssemblyStatus.InProgress, AssemblyStatus.Cancelled)]
    public void Rejects_invalid_transitions(AssemblyStatus from, AssemblyStatus to)
    {
        AssemblyLifecycle.CanTransition(from, to).Should().BeFalse();

        var act = () => AssemblyLifecycle.EnsureCanTransition(from, to);

        act.Should().Throw<DomainException>()
            .WithMessage($"*{from}*{to}*");
    }

    [Fact]
    public void Terminal_helpers()
    {
        AssemblyLifecycle.IsTerminal(AssemblyStatus.Completed).Should().BeTrue();
        AssemblyLifecycle.IsTerminal(AssemblyStatus.Cancelled).Should().BeTrue();
        AssemblyLifecycle.IsTerminal(AssemblyStatus.InProgress).Should().BeFalse();
        AssemblyLifecycle.AllowsOperationalMutation(AssemblyStatus.Completed).Should().BeFalse();
        AssemblyLifecycle.AllowsMeetingJoinToken(AssemblyStatus.Scheduled).Should().BeFalse();
        AssemblyLifecycle.AllowsMeetingJoinToken(AssemblyStatus.CheckIn).Should().BeTrue();
        AssemblyLifecycle.AllowsMeetingJoinToken(AssemblyStatus.InProgress).Should().BeTrue();
    }
}
