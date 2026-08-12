using System.Net;
using System.Net.Http.Json;
using Asambleas.Application.Quorum;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Evidence;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Quorum;
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
public sealed class AssemblyHistoricalSealTests
{
    private readonly AsambleasFixture _fixture;

    public AssemblyHistoricalSealTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Complete_freezes_quorum_seals_minutes_and_blocks_mutations()
    {
        await _fixture.ResetDatabaseAsync();
        await PrepareLiveAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var assemblyId = DemoSeedConstants.AssemblyOceanId;

        var open = await president.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/voting/open",
            new OpenVotingSessionRequest(DemoSeedConstants.Motion001Id, HidePartialResults: false));
        open.EnsureSuccessStatusCode();
        var session = await open.Content.ReadFromJsonAsync<VotingSessionDto>();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostJsonAsync(
                $"/api/assemblies/{assemblyId}/voting/{session!.Id}/cast",
                new CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id)))
            .EnsureSuccessStatusCode();

        (await president.PostAsync($"/api/assemblies/{assemblyId}/voting/{session.Id}/close"))
            .EnsureSuccessStatusCode();

        int snapshotsBeforeComplete;
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            snapshotsBeforeComplete = await db.QuorumSnapshots.IgnoreQueryFilters()
                .CountAsync(s => s.AssemblyId == assemblyId);
        }

        (await president.PostAsync($"/api/assemblies/{assemblyId}/complete"))
            .EnsureSuccessStatusCode();

        Guid endSnapshotId;
        decimal endPresent;
        int endEligible;
        int snapshotsAfterComplete;
        string? sealedHash;
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var end = await db.QuorumSnapshots.IgnoreQueryFilters()
                .Where(s => s.AssemblyId == assemblyId && s.Reason == QuorumService.AssemblyEndReason)
                .OrderByDescending(s => s.TimestampUtc)
                .FirstOrDefaultAsync();
            end.Should().NotBeNull();
            endSnapshotId = end!.Id;
            endPresent = end.PresentCoefficient;
            endEligible = end.EligibleUnits;
            snapshotsAfterComplete = await db.QuorumSnapshots.IgnoreQueryFilters()
                .CountAsync(s => s.AssemblyId == assemblyId);
            snapshotsAfterComplete.Should().Be(snapshotsBeforeComplete + 1);

            var assembly = await db.Assemblies.IgnoreQueryFilters().SingleAsync(a => a.Id == assemblyId);
            assembly.Status.Should().Be(AssemblyStatus.Completed);
            assembly.SealedMinutesHash.Should().NotBeNullOrWhiteSpace();
            sealedHash = assembly.SealedMinutesHash;
        }

        // Presence / quorum mutation must fail after Complete.
        var checkIn = await owner.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/attendance/check-in",
            new CheckInRequest(DemoSeedConstants.Unit101Id, PresenceType.Virtual.ToString()));
        checkIn.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var cast = await owner.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/voting/{session.Id}/cast",
            new CastVoteRequest("Against", DemoSeedConstants.Unit101Id));
        cast.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var openAgain = await president.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/voting/open",
            new OpenVotingSessionRequest(DemoSeedConstants.Motion001Id, HidePartialResults: false));
        openAgain.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var recording = await president.PostAsync($"/api/assemblies/{assemblyId}/recording/start");
        recording.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.Forbidden);

        var join = await owner.PostAsync($"/api/assemblies/{assemblyId}/meeting/join-token");
        join.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        // Mutate live PH coefficient — historical quorum must stay identical.
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var unit = await db.Units.IgnoreQueryFilters()
                .SingleAsync(u => u.Id == DemoSeedConstants.Unit101Id);
            unit.CoefficientPercent = Math.Max(0.0001m, unit.CoefficientPercent / 2m);
            await db.SaveChangesAsync();
        }

        var quorumResp = await president.GetAsync($"/api/assemblies/{assemblyId}/quorum");
        quorumResp.EnsureSuccessStatusCode();
        var quorum = await quorumResp.Content.ReadFromJsonAsync<QuorumDto>();
        quorum.Should().NotBeNull();
        quorum!.CurrentCoefficient.Should().Be(endPresent);
        quorum.EligibleUnits.Should().Be(endEligible);

        var minutesResp1 = await president.GetAsync($"/api/assemblies/{assemblyId}/minutes");
        minutesResp1.EnsureSuccessStatusCode();
        var minutes1 = await minutesResp1.Content.ReadFromJsonAsync<AssemblyMinutesDocumentDto>();
        minutes1!.IsSealed.Should().BeTrue();
        minutes1.ContentHash.Should().Be(sealedHash);

        var minutesResp2 = await president.GetAsync($"/api/assemblies/{assemblyId}/minutes");
        minutesResp2.EnsureSuccessStatusCode();
        var minutes2 = await minutesResp2.Content.ReadFromJsonAsync<AssemblyMinutesDocumentDto>();
        minutes2!.ContentHash.Should().Be(sealedHash);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var count = await db.QuorumSnapshots.IgnoreQueryFilters()
                .CountAsync(s => s.AssemblyId == assemblyId);
            count.Should().Be(snapshotsAfterComplete);
            var endStill = await db.QuorumSnapshots.IgnoreQueryFilters()
                .SingleAsync(s => s.Id == endSnapshotId);
            endStill.PresentCoefficient.Should().Be(endPresent);
            endStill.EligibleUnits.Should().Be(endEligible);
        }
    }

    [Fact]
    public async Task Publish_transitions_draft_to_scheduled()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        Guid draftId;
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var src = await db.Assemblies.IgnoreQueryFilters()
                .AsNoTracking()
                .SingleAsync(a => a.Id == DemoSeedConstants.AssemblyOceanId);
            var draft = new Domain.Entities.Assembly
            {
                TenantId = src.TenantId,
                PropertyHorizontalId = src.PropertyHorizontalId,
                Title = "Draft publish E2E",
                Status = AssemblyStatus.Draft,
                ScheduledAtUtc = DateTimeOffset.UtcNow.AddDays(3),
                RequiredQuorumPercent = src.RequiredQuorumPercent,
                Modality = src.Modality,
                AssemblyKind = src.AssemblyKind
            };
            db.Assemblies.Add(draft);
            db.AssemblyParticipants.Add(new Domain.Entities.AssemblyParticipant
            {
                TenantId = src.TenantId,
                AssemblyId = draft.Id,
                UserId = DemoSeedConstants.UserPresidentId,
                DisplayName = "President",
                RoleCode = "AssemblyPresident",
                AttendanceStatus = AttendanceStatus.Registered
            });
            await db.SaveChangesAsync();
            draftId = draft.Id;
        }

        var publish = await president.PostAsync($"/api/assemblies/{draftId}/publish");
        publish.EnsureSuccessStatusCode();
        var summary = await publish.Content.ReadFromJsonAsync<AssemblySummaryDto>();
        summary!.Status.Should().Be(nameof(AssemblyStatus.Scheduled));
    }

    private async Task PrepareLiveAsync()
    {
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var assemblyId = DemoSeedConstants.AssemblyOceanId;

        (await president.PostAsync($"/api/assemblies/{assemblyId}/start-checkin")).EnsureSuccessStatusCode();

        foreach (var email in new[] { "president@ocean.demo", "owner101@ocean.demo" })
        {
            var user = await AuthenticatedClient.LoginAsync(_fixture.Factory, email);
            Guid? unitId = email.StartsWith("owner", StringComparison.Ordinal)
                ? DemoSeedConstants.Unit101Id
                : null;
            (await user.PostJsonAsync(
                    $"/api/assemblies/{assemblyId}/attendance/check-in",
                    new CheckInRequest(unitId, PresenceType.Virtual.ToString())))
                .EnsureSuccessStatusCode();
        }

        (await president.PostAsync($"/api/assemblies/{assemblyId}/start")).EnsureSuccessStatusCode();
        (await president.PostJsonAsync(
                $"/api/assemblies/{assemblyId}/motions/present",
                new PresentMotionRequest(DemoSeedConstants.Motion001Id)))
            .EnsureSuccessStatusCode();
    }
}
