using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class AssemblyReadinessWorkflowTests
{
    private readonly AsambleasFixture _fixture;

    public AssemblyReadinessWorkflowTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Readiness_returns_actionable_checks_with_next_action()
    {
        await _fixture.ResetDatabaseAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var response = await president.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/readiness");

        response.EnsureSuccessStatusCode();
        var readiness = await response.Content.ReadFromJsonAsync<AssemblyReadinessDto>(
            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        readiness.Should().NotBeNull();
        readiness!.Checks.Should().NotBeEmpty();
        readiness.Checks.Should().Contain(c => c.Key == ReadinessCheckKeys.Agenda);
        readiness.TotalChecks.Should().Be(readiness.Checks.Count);
        readiness.CompletedChecks.Should().BeGreaterThan(0);
        readiness.OverallStatus.Should().BeOneOf(
            ReadinessOverallStatuses.Ready,
            ReadinessOverallStatuses.Warning,
            ReadinessOverallStatuses.Blocking);
    }

    [Fact]
    public async Task Readiness_is_tenant_isolated()
    {
        await _fixture.ResetDatabaseAsync();

        var oceanUser = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var denied = await oceanUser.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}/readiness");

        denied.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound,
            HttpStatusCode.BadRequest);
    }
}
