using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class AssemblyRoomStateTests
{
    private readonly AsambleasFixture _fixture;

    public AssemblyRoomStateTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Room_state_is_tenant_isolated()
    {
        await _fixture.ResetDatabaseAsync();

        var oceanUser = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");

        var denied = await oceanUser.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}/room-state");

        denied.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound,
            HttpStatusCode.BadRequest);

        var body = await denied.Content.ReadAsStringAsync();
        body.Should().NotContain("PH OTHER");
        body.Should().NotContain(DemoSeedConstants.TenantOtherId.ToString("D"));
    }

    [Fact]
    public async Task Room_state_hydrates_seeded_ocean_assembly()
    {
        await _fixture.ResetDatabaseAsync();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var response = await owner.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/room-state");

        response.EnsureSuccessStatusCode();
        var state = await response.Content.ReadFromJsonAsync<AssemblyRoomStateDto>(
            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        state.Should().NotBeNull();
        state!.Assembly.Id.Should().Be(DemoSeedConstants.AssemblyOceanId);
        state.Participants.Should().NotBeEmpty();
        state.Agenda.Should().NotBeEmpty();
        state.ViewerRole.Should().Be(AssemblyViewerRoles.Owner);
        state.Readiness.Should().NotBeNull();
        state.CurrentUserHasVoted.Should().BeFalse();
        state.CurrentUserEvidenceId.Should().BeNull();
    }

    [Fact]
    public async Task Dashboard_returns_contextual_cta_for_scheduled_assembly()
    {
        await _fixture.ResetDatabaseAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var response = await president.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/dashboard");

        response.EnsureSuccessStatusCode();
        var dashboard = await response.Content.ReadFromJsonAsync<AssemblyDashboardDto>(
            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        dashboard.Should().NotBeNull();
        dashboard!.PrimaryCta.Should().Be(AssemblyPrimaryCtas.StartCheckIn);
        dashboard.Readiness.ParticipantsReady.Should().BeTrue();
        dashboard.Counts.Participants.Should().BeGreaterThan(0);
    }
}
