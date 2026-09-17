using System.Net;
using System.Net.Http.Json;
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
    public async Task Owner102_presence_materializes_own_unit_plus_power_107()
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

        (await owner102.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence"))
            .EnsureSuccessStatusCode();

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var reps = await db.AssemblyRepresentations.IgnoreQueryFilters()
            .Where(r => r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                        && r.RepresentativeUserId == DemoSeedConstants.UserOwner102Id
                        && r.IsActive)
            .ToListAsync();
        reps.Should().HaveCount(2);
        reps.Sum(r => r.CoefficientSnapshot).Should().Be(22m);

        var p = await db.AssemblyParticipants.IgnoreQueryFilters()
            .SingleAsync(x => x.AssemblyId == DemoSeedConstants.AssemblyOceanId
                              && x.UserId == DemoSeedConstants.UserOwner102Id);
        p.AttendanceStatus.Should().Be(AttendanceStatus.Present);
        p.EffectiveCoefficientPercent.Should().Be(22m);
    }

    [Fact]
    public async Task Duplicate_presence_is_idempotent()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence"))
            .EnsureSuccessStatusCode();
        (await owner.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence"))
            .EnsureSuccessStatusCode();

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var count = await db.AssemblyRepresentations.IgnoreQueryFilters()
            .CountAsync(r => r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                             && r.RepresentativeUserId == DemoSeedConstants.UserOwner101Id
                             && r.IsActive);
        count.Should().Be(1);
    }

    [Fact]
    public async Task Owner_presence_materializes_unit_101()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var presence = await owner.PostAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence");
        presence.StatusCode.Should().Be(HttpStatusCode.OK);

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var reps = await db.AssemblyRepresentations.IgnoreQueryFilters()
            .Where(r => r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                        && r.RepresentativeUserId == DemoSeedConstants.UserOwner101Id
                        && r.IsActive)
            .ToListAsync();
        reps.Should().ContainSingle(r => r.UnitId == DemoSeedConstants.Unit101Id);
    }

    [Fact]
    public async Task Concurrent_presence_same_person_single_representation()
    {
        await _fixture.ResetDatabaseAsync();
        var p1 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await p1.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var ownerA = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner103@ocean.demo");
        var ownerB = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner103@ocean.demo");

        var t1 = ownerA.PostAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence");
        var t2 = ownerB.PostAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence");

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
