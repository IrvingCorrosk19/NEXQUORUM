using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
using FluentAssertions;

namespace Asambleas.UnitTests.Voting;

public sealed class VoteCloseOutcomeTests
{
    [Fact]
    public void Approved_when_quorum_is_met_and_the_votes_pass()
    {
        var outcome = VoteCloseOutcome.Resolve(quorumReached: true, MotionStatus.Approved);

        outcome.DecisionStatus.Should().Be("Approved");
        outcome.Display.Should().Be("Aprobada — Alcanzó los votos requeridos");
    }

    [Fact]
    public void Rejected_when_quorum_is_met_and_the_votes_fail()
    {
        var outcome = VoteCloseOutcome.Resolve(quorumReached: true, MotionStatus.Rejected);

        outcome.DecisionStatus.Should().Be("Rejected");
        outcome.Display.Should().Be("Rechazada — No alcanzó los votos requeridos");
    }

    [Fact]
    public void No_valid_decision_when_quorum_is_missing_even_if_votes_would_pass()
    {
        var outcome = VoteCloseOutcome.Resolve(quorumReached: false, MotionStatus.Approved);

        outcome.MotionStatus.Should().Be(MotionStatus.NoValidDecision);
        outcome.Display.Should().Be("Sin decisión válida — Quórum insuficiente");
    }
}
