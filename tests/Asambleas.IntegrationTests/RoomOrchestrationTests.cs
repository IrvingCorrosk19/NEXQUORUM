using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class RoomOrchestrationTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly AsambleasFixture _fixture;

    public RoomOrchestrationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Room_state_exposes_nested_agenda_and_speaker_queue()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        var response = await president.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/room-state");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        var root = doc.RootElement;

        root.TryGetProperty("agenda", out var agenda).Should().BeTrue();
        agenda.TryGetProperty("items", out var items).Should().BeTrue();
        items.GetArrayLength().Should().BeGreaterThan(0);
        agenda.TryGetProperty("activeAgendaItemId", out _).Should().BeTrue();

        root.TryGetProperty("speakerQueue", out var speakers).Should().BeTrue();
        speakers.TryGetProperty("queue", out _).Should().BeTrue();
        speakers.TryGetProperty("currentSpeakerRequestId", out _).Should().BeTrue();

        root.TryGetProperty("activeMotion", out _).Should().BeTrue();
        root.TryGetProperty("openVotingSession", out _).Should().BeTrue();
    }

    [Fact]
    public async Task Present_motion_then_open_voting_requires_presented_status()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();
        (await president.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                new Contracts.Assemblies.CheckInRequest(null, "Virtual")))
            .EnsureSuccessStatusCode();
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start"))
            .EnsureSuccessStatusCode();

        var openDraft = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
            new Contracts.Voting.OpenVotingSessionRequest(DemoSeedConstants.Motion001Id, true));
        openDraft.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        (await president.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/motions/present",
                new Contracts.Motions.PresentMotionRequest(DemoSeedConstants.Motion001Id)))
            .EnsureSuccessStatusCode();

        (await president.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/open",
                new Contracts.Voting.OpenVotingSessionRequest(DemoSeedConstants.Motion001Id, true)))
            .EnsureSuccessStatusCode();
    }
}
