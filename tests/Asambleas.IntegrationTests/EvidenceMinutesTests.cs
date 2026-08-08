using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Evidence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class EvidenceMinutesTests
{
    private readonly AsambleasFixture _fixture;

    public EvidenceMinutesTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Minutes_document_exposes_structured_sections()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        var response = await president.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/minutes");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doc = await response.Content.ReadFromJsonAsync<AssemblyMinutesDocumentDto>(
            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        doc.Should().NotBeNull();
        doc!.DocumentId.Should().StartWith("ACTA-");
        doc.ContentHash.Should().NotBeNullOrWhiteSpace();
        doc.Completeness.Should().NotBeNull();
        doc.Disclaimer.Should().NotBeNullOrWhiteSpace();
        doc.Agenda.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Evidence_package_includes_completeness_and_timeline()
    {
        await _fixture.ResetDatabaseAsync();
        var secretary = await AuthenticatedClient.LoginAsync(_fixture.Factory, "secretary@ocean.demo");

        var response = await secretary.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/evidence");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var package = await response.Content.ReadFromJsonAsync<AssemblyEvidencePackageDto>(
            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        package.Should().NotBeNull();
        package!.Completeness.Status.Should().BeOneOf("COMPLETE", "WARNING", "INCOMPLETE");
        package.Agenda.Should().NotBeEmpty();
        package.Timeline.Should().NotBeNull();
    }
}
