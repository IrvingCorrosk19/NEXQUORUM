using System.Net;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.SecurityTests;

[Collection(AsambleasCollection.Name)]
public sealed class ManipulatedIdTests
{
    private readonly AsambleasFixture _fixture;

    public ManipulatedIdTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Random_assembly_id_does_not_leak_or_succeed()
    {
        await _fixture.ResetDatabaseAsync();

        var user = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var forgedId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

        var response = await user.GetAsync($"/api/assemblies/{forgedId}");
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.BadRequest,
            HttpStatusCode.NotFound,
            HttpStatusCode.Forbidden);

        var body = await response.Content.ReadAsStringAsync();
        body.Should().NotContain("OCEAN TOWER");
    }

    [Fact]
    public async Task Retired_check_in_with_foreign_unit_id_is_gone_or_forbidden()
    {
        await _fixture.ResetDatabaseAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var response = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
            new Contracts.Assemblies.CheckInRequest(DemoSeedConstants.UnitOtherId, "Virtual"));

        // Endpoint retired (410) or authorization rejects before body (403).
        response.StatusCode.Should().BeOneOf(HttpStatusCode.Gone, HttpStatusCode.Forbidden);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().NotContain(DemoSeedConstants.TenantOtherId.ToString("D"));
    }

    [Fact]
    public async Task Presence_with_foreign_assembly_context_fails()
    {
        await _fixture.ResetDatabaseAsync();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var response = await owner.PostAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}/attendance/presence");

        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.BadRequest,
            HttpStatusCode.NotFound,
            HttpStatusCode.Forbidden);
        var body = await response.Content.ReadAsStringAsync();
        body.Should().NotContain("PH OTHER ISOLATION");
    }

    [Fact]
    public async Task Vote_cast_with_unknown_session_fails()
    {
        await _fixture.ResetDatabaseAsync();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var response = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/voting/{Guid.NewGuid()}/cast",
            new Contracts.Voting.CastVoteRequest("InFavor", DemoSeedConstants.Unit101Id));

        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.BadRequest,
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound);
    }
}
