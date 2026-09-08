using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Motions;
using Asambleas.Contracts.Voting;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class VotingOpenLifecycleTests
{
    private readonly AsambleasFixture _fixture;
    public VotingOpenLifecycleTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Open_voting_on_draft_motion_is_rejected_with_clear_code()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();
        await AttendanceTestHelpers.AccreditAsync(
            president, DemoSeedConstants.AssemblyOceanId, DemoSeedConstants.UserPresidentId);
        await AttendanceTestHelpers.MarkPresentAsync(president, DemoSeedConstants.AssemblyOceanId);
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start"))
            .EnsureSuccessStatusCode();

        var create = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/motions",
            new CreateMotionRequest(
                DemoSeedConstants.Agenda03Id,
                $"D{Guid.NewGuid():N}"[..8],
                "Draft only",
                "Draft only",
                QuestionText: "Draft only?"));
        create.EnsureSuccessStatusCode();
        var motion = await create.Content.ReadFromJsonAsync<MotionDto>();
        motion!.Status.Should().Be("Draft");

        var open = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
            new OpenVotingSessionRequest(motion.Id));
        open.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var raw = await open.Content.ReadAsStringAsync();
        raw.Should().Contain("MOTION_NOT_PRESENTED");
        raw.Should().MatchRegex("borrador|Present");
    }

    [Fact]
    public async Task Present_is_required_before_participant_can_receive_open_session()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        await AttendanceTestHelpers.AccreditAndPresentAsync(
            president, owner, DemoSeedConstants.AssemblyOceanId, DemoSeedConstants.UserOwner101Id);

        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start"))
            .EnsureSuccessStatusCode();

        var create = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/motions",
            new CreateMotionRequest(
                DemoSeedConstants.Agenda03Id,
                $"P{Guid.NewGuid():N}"[..8],
                "Lifecycle",
                "Lifecycle",
                QuestionText: "Lifecycle?"));
        create.EnsureSuccessStatusCode();
        var motion = await create.Content.ReadFromJsonAsync<MotionDto>();

        // After create only: room-state must not expose Open session
        var room1 = await owner.Client.GetFromJsonAsync<AssemblyRoomStateDto>(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/room-state");
        room1!.OpenVotingSession.Should().BeNull();

        (await president.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/motions/present",
                new PresentMotionRequest(motion!.Id)))
            .EnsureSuccessStatusCode();

        var room2 = await owner.Client.GetFromJsonAsync<AssemblyRoomStateDto>(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/room-state");
        room2!.OpenVotingSession.Should().BeNull("present alone must not open voting");
        room2.ActiveMotion.Should().NotBeNull();
        room2.ActiveMotion!.Status.Should().Be("Presented");

        var open = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
            new OpenVotingSessionRequest(motion.Id));
        open.EnsureSuccessStatusCode();
        var session = await open.Content.ReadFromJsonAsync<VotingSessionDto>();
        session!.Status.Should().Be("Open");

        var room3 = await owner.Client.GetFromJsonAsync<AssemblyRoomStateDto>(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/room-state");
        room3!.OpenVotingSession.Should().NotBeNull();
        room3.OpenVotingSession!.Id.Should().Be(session.Id);

        var cast = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{session.Id}/cast",
            new CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id));
        cast.EnsureSuccessStatusCode();
    }
}