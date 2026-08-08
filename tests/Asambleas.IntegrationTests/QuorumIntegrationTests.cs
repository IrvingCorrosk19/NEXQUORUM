using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class QuorumIntegrationTests
{
    private readonly AsambleasFixture _fixture;

    public QuorumIntegrationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Check_ins_update_quorum_snapshot()
    {
        await _fixture.ResetDatabaseAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner101 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner101.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                new CheckInRequest(DemoSeedConstants.Unit101Id, PresenceType.Virtual.ToString())))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        await AssertLatestSnapshotAsync(presentCoefficient: 14m, QuorumStatus.NotReached);

        var owner102 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner102@ocean.demo");
        var owner103 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner103@ocean.demo");
        var owner104 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner104@ocean.demo");

        foreach (var (client, unitId) in new[]
                 {
                     (owner102, DemoSeedConstants.Unit102Id),
                     (owner103, DemoSeedConstants.Unit103Id),
                     (owner104, DemoSeedConstants.Unit104Id)
                 })
        {
            (await client.PostJsonAsync(
                    $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                    new CheckInRequest(unitId, PresenceType.Virtual.ToString())))
                .EnsureSuccessStatusCode();
        }

        // 101(14) + 102(14)+power107(8) + 103(14) + 104(14) = 64
        await AssertLatestSnapshotAsync(presentCoefficient: 64m, QuorumStatus.Reached);
    }

    private async Task AssertLatestSnapshotAsync(decimal presentCoefficient, QuorumStatus status)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();

        var latest = await db.QuorumSnapshots.IgnoreQueryFilters()
            .Where(s => s.AssemblyId == DemoSeedConstants.AssemblyOceanId)
            .OrderByDescending(s => s.TimestampUtc)
            .FirstOrDefaultAsync();

        latest.Should().NotBeNull();
        latest!.PresentUnits.Should().BeGreaterThanOrEqualTo(1);
        latest.PresentCoefficient.Should().Be(presentCoefficient);
        latest.RequiredCoefficient.Should().Be(50m);
        latest.Status.Should().Be(status);
    }
}
