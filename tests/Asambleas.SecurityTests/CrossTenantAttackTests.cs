using System.Net;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.SecurityTests;

/// <summary>
/// Expectation documented for EO-001: CROSS_TENANT_LEAKS = 0.
/// Tenant Ocean users must not receive Tenant OTHERPH assembly/PH payloads.
/// </summary>
[Collection(AsambleasCollection.Name)]
public sealed class CrossTenantAttackTests
{
    private readonly AsambleasFixture _fixture;

    public CrossTenantAttackTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Ocean_user_cannot_read_other_tenant_assembly()
    {
        await _fixture.ResetDatabaseAsync();

        var attacker = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var response = await attacker.GetAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}");

        AssertDeniedWithoutLeak(response, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Ocean_user_cannot_check_in_to_other_tenant_assembly()
    {
        await _fixture.ResetDatabaseAsync();

        var attacker = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var response = await attacker.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}/attendance/check-in",
            new Contracts.Assemblies.CheckInRequest(DemoSeedConstants.UnitOtherId, "Virtual"));

        AssertDeniedWithoutLeak(response, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Ocean_user_cannot_read_other_tenant_audit()
    {
        await _fixture.ResetDatabaseAsync();

        var attacker = await AuthenticatedClient.LoginAsync(_fixture.Factory, "secretary@ocean.demo");
        var response = await attacker.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}/audit");

        AssertDeniedWithoutLeak(response, await response.Content.ReadAsStringAsync());
    }

    private static void AssertDeniedWithoutLeak(HttpResponseMessage response, string body)
    {
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound,
            HttpStatusCode.BadRequest);

        body.Should().NotContain("PH OTHER ISOLATION");
        body.Should().NotContain(DemoSeedConstants.TenantOtherId.ToString("D"));
        body.Should().NotContain(DemoSeedConstants.PhOtherId.ToString("D"));
        // CROSS_TENANT_LEAKS = 0
        ((int)response.StatusCode).Should().NotBe(200);
    }
}
