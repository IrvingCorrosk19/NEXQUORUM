using Asambleas.Application.Assembly;
using Asambleas.Application.Evidence;
using Asambleas.Domain.Quorum;

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
    public void Closed_file_stays_final_when_there_are_notes()
    {
        Assert.Equal("COMPLETE", EvidenceCompletenessRules.StatusLabel(isClosed: true, noteCount: 2, hasAttendance: true, hasAgenda: true));
        Assert.Equal("WARNING", EvidenceCompletenessRules.StatusLabel(isClosed: false, noteCount: 0, hasAttendance: true, hasAgenda: true));
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
