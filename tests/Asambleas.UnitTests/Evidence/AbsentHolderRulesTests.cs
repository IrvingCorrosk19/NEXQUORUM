using Asambleas.Application.Evidence;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Evidence;

namespace Asambleas.UnitTests.Evidence;

public sealed class AbsentHolderRulesTests
{
    static AssemblyParticipantDto Present(Guid userId, Guid unitId, string code) =>
        new(Guid.NewGuid(), Guid.NewGuid(), userId, unitId, code, 60m, "Presente", "Owner", "Present", DateTimeOffset.UtcNow, true, 60m);

    static RepresentationEvidenceDto Rep(Guid userId, Guid unitId, string code, string source, Guid? powerId = null) =>
        new(unitId, code, 60m, userId, "Persona", source, powerId, true);

    [Fact]
    public void Own_presence_is_not_an_absent_holding()
    {
        var user = Guid.NewGuid();
        var unit = Guid.NewGuid();
        var rows = AbsentHolderRules.Select(
            [Present(user, unit, "C-101")],
            [Rep(user, unit, "C-101", "Ownership")]);
        Assert.Empty(rows);
    }

    [Fact]
    public void Power_stays_when_the_same_unit_code_is_present()
    {
        var owner = Guid.NewGuid();
        var proxy = Guid.NewGuid();
        var unit = Guid.NewGuid();
        var rows = AbsentHolderRules.Select(
            [Present(owner, unit, "C-101")],
            [Rep(proxy, unit, "C-101", "Power", Guid.NewGuid())]);
        Assert.Single(rows);
    }

    [Fact]
    public void Absent_coowner_stays_even_if_the_unit_code_matches()
    {
        var present = Guid.NewGuid();
        var absent = Guid.NewGuid();
        var unit = Guid.NewGuid();
        var rows = AbsentHolderRules.Select(
            [Present(present, unit, "C-101")],
            [
                Rep(present, unit, "C-101", "Ownership"),
                Rep(absent, unit, "C-101", "Ownership")
            ]);
        Assert.Single(rows);
        Assert.Equal(absent, rows[0].RepresentativeUserId);
    }
}
