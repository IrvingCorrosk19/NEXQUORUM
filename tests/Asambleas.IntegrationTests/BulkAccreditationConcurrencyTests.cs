using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Representation;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class BulkAccreditationConcurrencyTests
{
    private readonly AsambleasFixture _fixture;
    public BulkAccreditationConcurrencyTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Concurrent_bulk_accreditation_returns_gone()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var batchId = Guid.NewGuid();
        var body = new BulkAccreditRequest(
            UserIds: [DemoSeedConstants.UserOwner101Id],
            Method: "OperatorBulkSelected",
            ClientBatchId: batchId);

        var t1 = president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk", body);
        var t2 = president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk", body);
        var responses = await Task.WhenAll(t1, t2);
        responses[0].StatusCode.Should().Be(HttpStatusCode.Gone);
        responses[1].StatusCode.Should().Be(HttpStatusCode.Gone);
    }

    [Fact]
    public async Task Padron_csv_and_diagnostic_endpoints_work()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var diag = await president.Client.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/quorum/padron-diagnostic");
        diag.EnsureSuccessStatusCode();
        var csv = await president.Client.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/quorum/padron.csv");
        csv.EnsureSuccessStatusCode();
        var text = await csv.Content.ReadAsStringAsync();
        text.Should().Contain("UnitCode");
        text.Should().Contain("CoefficientPercent");
    }

    [Fact]
    public async Task Participants_server_page_returns_total_and_slice()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var page = await president.Client.GetFromJsonAsync<ParticipantsPageDto>(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants?skip=0&take=2");
        page!.Take.Should().Be(2);
        page.Items.Count.Should().BeLessThanOrEqualTo(2);
        page.Total.Should().BeGreaterThanOrEqualTo(page.Items.Count);
    }
}
