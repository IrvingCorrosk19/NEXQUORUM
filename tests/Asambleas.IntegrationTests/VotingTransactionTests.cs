using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Voting;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class VotingTransactionTests
{
    private readonly AsambleasFixture _fixture;

    public VotingTransactionTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Cast_vote_persists_and_double_vote_fails()
    {
        await _fixture.ResetDatabaseAsync();
        await PrepareAssemblyForVotingAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var openResponse = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
            new OpenVotingSessionRequest(DemoSeedConstants.Motion001Id, HidePartialResults: false));
        openResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var session = await openResponse.Content.ReadFromJsonAsync<VotingSessionDto>();
        session.Should().NotBeNull();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var cast1 = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session!.Id}/cast",
            new CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id));
        cast1.StatusCode.Should().Be(HttpStatusCode.OK);
        var castBody = await cast1.Content.ReadFromJsonAsync<CastVoteResponse>();
        castBody!.VoteId.Should().NotBeEmpty();
        castBody.EvidenceId.Should().NotBeEmpty();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var voteCount = await db.Votes.IgnoreQueryFilters()
                .CountAsync(v => v.VotingSessionId == session.Id && v.UserId == DemoSeedConstants.UserOwner101Id);
            voteCount.Should().Be(1);
        }

        var cast2 = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/cast",
            new CastVoteRequest("Against", DemoSeedConstants.Unit101Id));
        // Different choice after success → ALREADY_VOTED (400), not a second row.
        cast2.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await cast2.Content.ReadAsStringAsync();
        problem.Should().Contain("Double vote");

        // Idempotent replay: same choice returns existing receipt (exactly-once effect).
        var castReplay = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/cast",
            new CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id, ClientRequestId: "eo5-replay-1"));
        castReplay.StatusCode.Should().Be(HttpStatusCode.OK);
        var replayBody = await castReplay.Content.ReadFromJsonAsync<CastVoteResponse>();
        replayBody!.EvidenceId.Should().Be(castBody.EvidenceId);
        replayBody.IdempotentReplay.Should().BeTrue();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var voteCount = await db.Votes.IgnoreQueryFilters()
                .CountAsync(v => v.VotingSessionId == session.Id && v.UserId == DemoSeedConstants.UserOwner101Id);
            voteCount.Should().Be(1);
        }

        var statusResponse = await owner.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/my-status");
        statusResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var status = await statusResponse.Content.ReadFromJsonAsync<MyVoteStatusDto>();
        status!.Status.Should().Be("ALREADY_VOTED");
        status.EvidenceId.Should().Be(castBody.EvidenceId);
    }

    [Fact]
    public async Task Concurrent_casts_produce_single_vote()
    {
        await _fixture.ResetDatabaseAsync();
        await PrepareAssemblyForVotingAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var openResponse = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
            new OpenVotingSessionRequest(DemoSeedConstants.Motion001Id, HidePartialResults: true));
        openResponse.EnsureSuccessStatusCode();
        var session = await openResponse.Content.ReadFromJsonAsync<VotingSessionDto>();

        var ownerA = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var ownerB = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");

        var t1 = ownerA.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session!.Id}/cast",
            new CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id, "conc-a"));
        var t2 = ownerB.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/cast",
            new CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id, "conc-b"));

        var results = await Task.WhenAll(t1, t2);
        results.Count(r => r.IsSuccessStatusCode).Should().BeGreaterThanOrEqualTo(1);

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var voteCount = await db.Votes.IgnoreQueryFilters()
            .CountAsync(v => v.VotingSessionId == session.Id && v.UserId == DemoSeedConstants.UserOwner101Id);
        voteCount.Should().Be(1);
    }

    [Fact]
    public async Task Complete_assembly_blocked_while_voting_open()
    {
        await _fixture.ResetDatabaseAsync();
        await PrepareAssemblyForVotingAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
                new OpenVotingSessionRequest(DemoSeedConstants.Motion001Id, HidePartialResults: true)))
            .EnsureSuccessStatusCode();

        var complete = await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/complete");
        complete.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await complete.Content.ReadAsStringAsync();
        body.Should().Contain("voting session is open");
    }

    private async Task PrepareAssemblyForVotingAsync()
    {
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        foreach (var email in new[]
                 {
                     "president@ocean.demo",
                     "owner101@ocean.demo"
                 })
        {
            var user = await AuthenticatedClient.LoginAsync(_fixture.Factory, email);
            var unitId = email.StartsWith("president", StringComparison.Ordinal)
                ? DemoSeedConstants.Unit107Id
                : DemoSeedConstants.Unit101Id;

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
