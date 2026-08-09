using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Voting;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class VotingResultPolicyTests
{
    private readonly AsambleasFixture _fixture;

    public VotingResultPolicyTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task HiddenUntilClose_owner_results_have_no_trend()
    {
        await _fixture.ResetDatabaseAsync();
        await PrepareAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var open = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
            new OpenVotingSessionRequest(
                DemoSeedConstants.Motion001Id,
                HidePartialResults: true,
                ResultVisibilityPolicy: "HiddenUntilClose"));
        open.StatusCode.Should().Be(HttpStatusCode.OK);
        var session = await open.Content.ReadFromJsonAsync<VotingSessionDto>();
        session!.ResultVisibilityPolicy.Should().Be("HiddenUntilClose");
        session.EligibleVoters.Should().BeGreaterThan(0);

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/cast",
                new CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id)))
            .EnsureSuccessStatusCode();

        var results = await owner.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/results");
        results.StatusCode.Should().Be(HttpStatusCode.OK);
        var tally = await results.Content.ReadFromJsonAsync<VoteTallyDto>();
        tally!.TrendHidden.Should().BeTrue();
        tally.InFavorCoefficient.Should().Be(0);
        tally.AgainstCoefficient.Should().Be(0);
        tally.VotesCast.Should().Be(1);
        tally.EligibleVoters.Should().Be(session.EligibleVoters);
    }

    [Fact]
    public async Task PresidentOnlyLive_president_sees_trend_owner_does_not()
    {
        await _fixture.ResetDatabaseAsync();
        await PrepareAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var open = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
            new OpenVotingSessionRequest(
                DemoSeedConstants.Motion001Id,
                ResultVisibilityPolicy: "PresidentOnlyLive"));
        open.EnsureSuccessStatusCode();
        var session = await open.Content.ReadFromJsonAsync<VotingSessionDto>();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session!.Id}/cast",
                new CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id)))
            .EnsureSuccessStatusCode();

        var ownerTally = await (await owner.GetAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/results"))
            .Content.ReadFromJsonAsync<VoteTallyDto>();
        ownerTally!.TrendHidden.Should().BeTrue();
        ownerTally.InFavorCoefficient.Should().Be(0);

        var presidentTally = await (await president.GetAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/results"))
            .Content.ReadFromJsonAsync<VoteTallyDto>();
        presidentTally!.TrendHidden.Should().BeFalse();
        presidentTally.InFavorCoefficient.Should().BeGreaterThan(0);
    }

    private async Task PrepareAsync()
    {
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        foreach (var email in new[] { "president@ocean.demo", "owner101@ocean.demo", "owner102@ocean.demo" })
        {
            var user = await AuthenticatedClient.LoginAsync(_fixture.Factory, email);
            Guid? unitId = email.StartsWith("owner", StringComparison.Ordinal)
                ? email.Contains("102") ? DemoSeedConstants.Unit102Id : DemoSeedConstants.Unit101Id
                : null;
            (await user.PostJsonAsync(
                    $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                    new CheckInRequest(unitId, PresenceType.Virtual.ToString())))
                .EnsureSuccessStatusCode();
        }

        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start"))
            .EnsureSuccessStatusCode();
        (await president.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/motions/present",
                new Contracts.Motions.PresentMotionRequest(DemoSeedConstants.Motion001Id)))
            .EnsureSuccessStatusCode();
    }
}
