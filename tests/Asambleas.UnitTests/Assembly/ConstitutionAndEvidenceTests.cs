using Asambleas.Application.Assembly;
using Asambleas.Application.Calendar;
using Asambleas.Application.Documents;
using Asambleas.Application.Evidence;
using Asambleas.Domain.Common;
using Asambleas.Domain.Quorum;
using Asambleas.Domain.Voting;

namespace Asambleas.UnitTests.Assembly;

public sealed class ConstitutionAndEvidenceTests
{
    [Theory]
    [InlineData(0, 50, false)]
    [InlineData(49.9999, 50, false)]
    [InlineData(50, 50, true)]
    [InlineData(50.0001, 50, true)]
    [InlineData(0, 0, true)]
    public void Constitution_requires_the_configured_minimum(decimal present, decimal required, bool allowed)
    {
        Assert.Equal(allowed, ConstitutionQuorum.CanConstitute(present, required));
    }

    [Fact]
    public void Constitution_block_explains_the_missing_quorum()
    {
        var message = ConstitutionQuorum.BlockMessage(0m, 50m);
        Assert.Contains("0.00%", message);
        Assert.Contains("50.00%", message);
        Assert.Contains("No hay una excepción", message);
    }

    [Fact]
    public void Sealed_file_stays_final_and_a_closed_file_without_seal_does_not()
    {
        Assert.Equal("COMPLETE", EvidenceCompletenessRules.StatusLabel(isClosed: true, noteCount: 2, hasAttendance: true, hasAgenda: true, minutesSealed: true));
        Assert.Equal("UNSEALED", EvidenceCompletenessRules.StatusLabel(isClosed: true, noteCount: 2, hasAttendance: true, hasAgenda: true, minutesSealed: false));
        Assert.Equal("WARNING", EvidenceCompletenessRules.StatusLabel(isClosed: false, noteCount: 0, hasAttendance: true, hasAgenda: true));
    }

    [Fact]
    public void Scheduled_minutes_are_not_described_as_still_open()
    {
        Assert.Equal("PROGRAMADA", DocumentLabels.DocumentLifecycle("Scheduled"));
        Assert.Equal("MESA ABIERTA", DocumentLabels.DocumentLifecycle("CheckIn"));
        Assert.Equal("EN CURSO", DocumentLabels.DocumentLifecycle("InProgress"));
        Assert.Equal("FINALIZADA — ACTA PENDIENTE DE SELLO", DocumentLabels.DocumentLifecycle("Completed"));
        Assert.Equal("ACTA SELLADA", DocumentLabels.DocumentLifecycle("Completed", sealedMinutes: true));
        Assert.Contains("programada", DocumentLabels.OpenAssemblyNotice("Scheduled"));
        Assert.DoesNotContain("sigue abierta", DocumentLabels.OpenAssemblyNotice("Scheduled"));
    }

    [Fact]
    public void A_draft_motion_is_not_a_presented_motion()
    {
        Assert.Equal("Borrador", DocumentLabels.MotionFact("Draft", "Draft", null));
        Assert.Equal("Preparada", DocumentLabels.MotionFact("Draft", "Ready", null));
        Assert.Equal("Presentada sin apertura", DocumentLabels.MotionFact("Presented", "Ready", null));
        Assert.Equal("Votación abierta", DocumentLabels.MotionFact("Voting", "Ready", "Open"));
        Assert.Equal("Votación cerrada", DocumentLabels.MotionFact("Approved", "Ready", "Closed"));
        Assert.Equal("Cancelada", DocumentLabels.MotionFact("Cancelled", "Ready", null));
    }

    [Fact]
    public void A_changed_vote_keeps_the_original_and_explains_the_policy()
    {
        Assert.Equal("ALREADY_VOTED", VotingCodes.AlreadyVoted);
        Assert.Equal(
            "Tu voto ya fue registrado y esta votación no permite cambiarlo.",
            VotingCodes.VoteChangeNotAllowed);
    }

    [Fact]
    public void An_explicit_property_is_not_replaced_by_the_active_one()
    {
        var active = Guid.Parse("7430972c-78f7-45ff-aa82-5a7b8effd6bd");
        var requested = Guid.Parse("d3333416-5b2c-4b4b-b825-cd8a5db64c92");
        Assert.Equal(requested, AssemblyCreateTarget.Resolve(requested, active, mayScheduleExplicitPh: true));
        Assert.Equal(active, AssemblyCreateTarget.Resolve(Guid.Empty, active, mayScheduleExplicitPh: false));
        var error = Assert.Throws<DomainException>(() =>
            AssemblyCreateTarget.Resolve(requested, active, mayScheduleExplicitPh: false));
        Assert.Equal("PH_CONTEXT_MISMATCH", error.Code);
    }

    [Fact]
    public void Desk_staff_is_not_a_convoked_owner()
    {
        Assert.True(DeskStaffRoles.IsDeskStaff("Operator"));
        Assert.True(DeskStaffRoles.IsDeskStaff("PHAdmin"));
        Assert.False(DeskStaffRoles.IsDeskStaff("Owner"));
        Assert.False(DeskStaffRoles.IsDeskStaff(""));
    }
}
