using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Representation;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class AttendanceRepresentationTests
{
    private readonly AsambleasFixture _fixture;

    public AttendanceRepresentationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Owner102_accredits_with_own_unit_plus_power_107()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner102 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner102@ocean.demo");
        var preview = await owner102.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner102Id}/preview");
        preview.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await preview.Content.ReadFromJsonAsync<RepresentationPreviewDto>();
        body!.EffectiveCoefficientPercent.Should().Be(22m);
        body.Represented.Should().ContainSingle(r => r.UnitCode == "107");

        var checkIn = await owner102.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
            new CheckInRequest(null, PresenceType.Virtual.ToString()));
        checkIn.StatusCode.Should().Be(HttpStatusCode.OK);
        var result = await checkIn.Content.ReadFromJsonAsync<CheckInResponse>();
        result!.IsAccredited.Should().BeTrue();
        result.EffectiveCoefficientPercent.Should().Be(22m);

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var reps = await db.AssemblyRepresentations.IgnoreQueryFilters()
            .Where(r => r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                        && r.RepresentativeUserId == DemoSeedConstants.UserOwner102Id
                        && r.IsActive)
            .ToListAsync();
        reps.Should().HaveCount(2);
        reps.Sum(r => r.CoefficientSnapshot).Should().Be(22m);
    }

    [Fact]
    public async Task Duplicate_check_in_is_idempotent()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                new CheckInRequest(DemoSeedConstants.Unit101Id, "Virtual")))
            .EnsureSuccessStatusCode();

        var again = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
            new CheckInRequest(DemoSeedConstants.Unit101Id, "Virtual"));
        again.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await again.Content.ReadFromJsonAsync<CheckInResponse>();
        body!.IdempotentReplay.Should().BeTrue();

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var count = await db.AssemblyRepresentations.IgnoreQueryFilters()
            .CountAsync(r => r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                             && r.RepresentativeUserId == DemoSeedConstants.UserOwner101Id
                             && r.IsActive);
        count.Should().Be(1);
    }

    [Fact]
    public async Task Operator_can_accredit_another_participant()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var accredit = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner101Id}/accredit",
            new AccreditRequest("InPerson", "OperatorCheckIn"));
        accredit.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await accredit.Content.ReadFromJsonAsync<AccreditResponse>();
        body!.IsAccredited.Should().BeTrue();
        body.EffectiveCoefficientPercent.Should().Be(14m);
        body.Representations.Should().ContainSingle(r => r.UnitCode == "101");
    }

    [Fact]
    public async Task Concurrent_operator_accredits_same_person_single_representation()
    {
        await _fixture.ResetDatabaseAsync();
        var p1 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await p1.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var presidentA = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var secretary = await AuthenticatedClient.LoginAsync(_fixture.Factory, "secretary@ocean.demo");

        var t1 = presidentA.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner103Id}/accredit",
            new AccreditRequest("InPerson"));
        var t2 = secretary.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner103Id}/accredit",
            new AccreditRequest("InPerson"));

        var results = await Task.WhenAll(t1, t2);
        results.Count(r => r.IsSuccessStatusCode).Should().BeGreaterThanOrEqualTo(1);

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var reps = await db.AssemblyRepresentations.IgnoreQueryFilters()
            .CountAsync(r => r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                             && r.UnitId == DemoSeedConstants.Unit103Id
                             && r.IsActive);
        reps.Should().Be(1);
    }
}
