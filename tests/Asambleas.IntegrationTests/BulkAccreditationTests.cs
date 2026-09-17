using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Representation;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

/// <summary>Bulk accreditation retired — endpoints return 410 Gone.</summary>
[Collection(AsambleasCollection.Name)]
public sealed class BulkAccreditationTests
{
    private readonly AsambleasFixture _fixture;
    public BulkAccreditationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Bulk_accreditation_endpoints_return_gone()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var preview = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk/preview",
            new BulkAccreditRequest(UserIds: [DemoSeedConstants.UserOwner101Id]));
        preview.StatusCode.Should().Be(HttpStatusCode.Gone);

        var bulk = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk",
            new BulkAccreditRequest(UserIds: [DemoSeedConstants.UserOwner101Id]));
        bulk.StatusCode.Should().Be(HttpStatusCode.Gone);

        var dePreview = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/deaccredit-bulk/preview",
            new BulkDeaccreditRequest(UserIds: [DemoSeedConstants.UserOwner101Id], Reason: "Prueba retiro masivo"));
        dePreview.StatusCode.Should().Be(HttpStatusCode.Gone);

        var deBulk = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/deaccredit-bulk",
            new BulkDeaccreditRequest(UserIds: [DemoSeedConstants.UserOwner101Id], Reason: "Prueba retiro masivo"));
        deBulk.StatusCode.Should().Be(HttpStatusCode.Gone);
    }
}
