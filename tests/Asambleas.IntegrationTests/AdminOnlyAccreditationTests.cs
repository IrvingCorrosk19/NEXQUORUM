using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Quorum;
using Asambleas.Contracts.Representation;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

/// <summary>
/// Accreditation endpoints retired. Convocation authorizes; presence drives quorum/vote.
/// </summary>
[Collection(AsambleasCollection.Name)]
public sealed class AdminOnlyAccreditationTests
{
    private readonly AsambleasFixture _fixture;

    public AdminOnlyAccreditationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact(DisplayName = "Accreditation endpoints return 410 Gone")]
    public async Task Accreditation_endpoints_are_gone()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var accredit = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner101Id}/accredit",
            new AccreditRequest("Virtual", "OperatorCheckIn"));
        accredit.StatusCode.Should().Be(HttpStatusCode.Gone);

        var deaccredit = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner101Id}/deaccredit",
            new DeaccreditRequest("Motivo de prueba de retiro"));
        deaccredit.StatusCode.Should().Be(HttpStatusCode.Gone);

        var checkIn = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
            new CheckInRequest(DemoSeedConstants.Unit101Id, "Virtual", "OperatorSelfCheckIn"));
        checkIn.StatusCode.Should().Be(HttpStatusCode.Gone);
    }

    [Fact(DisplayName = "Convoked owner can mark presence without accreditation")]
    public async Task Convoked_owner_marks_presence_directly()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence"))
            .EnsureSuccessStatusCode();

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var p = await db.AssemblyParticipants.IgnoreQueryFilters()
            .SingleAsync(x => x.AssemblyId == DemoSeedConstants.AssemblyOceanId
                              && x.UserId == DemoSeedConstants.UserOwner101Id);
        p.AttendanceStatus.Should().Be(AttendanceStatus.Present);
        p.EffectiveCoefficientPercent.Should().BeGreaterThan(0);
    }

    [Fact(DisplayName = "Convocation alone does not inflate quorum; presence does")]
    public async Task Presence_not_convocation_inflates_quorum()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var quorumBefore = await president.GetAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/quorum");
        quorumBefore.EnsureSuccessStatusCode();
        var before = await quorumBefore.Content.ReadFromJsonAsync<QuorumStateDto>();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence"))
            .EnsureSuccessStatusCode();

        var quorumAfter = await president.GetAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/quorum");
        quorumAfter.EnsureSuccessStatusCode();
        var after = await quorumAfter.Content.ReadFromJsonAsync<QuorumStateDto>();
        after!.CurrentCoefficient.Should().BeGreaterThan(before!.CurrentCoefficient);
    }
}
