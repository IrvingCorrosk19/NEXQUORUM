using System.Net;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class TenantIsolationTests
{
    private readonly AsambleasFixture _fixture;

    public TenantIsolationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Tenant_A_cannot_read_Tenant_B_assembly_CROSS_TENANT()
    {
        await _fixture.ResetDatabaseAsync();

        var oceanUser = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");

        var response = await oceanUser.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}");

        // Query filters hide foreign-tenant rows → not found (400) rather than leaking payload.
        // Explicit cross-tenant guard maps to 403 when a row is visible without filters.
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound,
            HttpStatusCode.BadRequest);

        var body = await response.Content.ReadAsStringAsync();
        body.Should().NotContain(DemoSeedConstants.PhOtherId.ToString("D"));
        body.Should().NotContain("PH OTHER");
        body.Should().NotContain("\"tenantId\":\"" + DemoSeedConstants.TenantOtherId.ToString("D") + "\"",
            because: "CROSS_TENANT_LEAKS must remain 0");
    }
}
