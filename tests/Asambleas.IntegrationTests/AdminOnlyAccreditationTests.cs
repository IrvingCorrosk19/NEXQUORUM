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
public sealed class AdminOnlyAccreditationTests
{
    private readonly AsambleasFixture _fixture;

    public AdminOnlyAccreditationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact(DisplayName = "Owner cannot self-accredit via check-in (403)")]
    public async Task Owner_check_in_is_forbidden()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var denied = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
            new CheckInRequest(DemoSeedConstants.Unit101Id, "Virtual", "SelfCheckIn"));
        denied.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var p = await db.AssemblyParticipants.IgnoreQueryFilters()
            .SingleAsync(x => x.AssemblyId == DemoSeedConstants.AssemblyOceanId
                              && x.UserId == DemoSeedConstants.UserOwner101Id);
        p.IsAccredited.Should().BeFalse();
        p.AttendanceStatus.Should().Be(AttendanceStatus.Registered);
    }

    [Fact(DisplayName = "Owner cannot accredit another participant (403)")]
    public async Task Owner_cannot_accredit_others()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var denied = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner102Id}/accredit",
            new AccreditRequest("Virtual", "OperatorCheckIn"));
        denied.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact(DisplayName = "Admin accredit does not count as presence/quorum until owner joins")]
    public async Task Accreditation_does_not_inflate_quorum_before_presence()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var accredit = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner101Id}/accredit",
            new AccreditRequest("Virtual", "OperatorCheckIn"));
        accredit.EnsureSuccessStatusCode();
        var body = await accredit.Content.ReadFromJsonAsync<AccreditResponse>();
        body!.IsAccredited.Should().BeTrue();
        body.AttendanceStatus.Should().Be(nameof(AttendanceStatus.Registered));

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var p = await db.AssemblyParticipants.IgnoreQueryFilters()
                .SingleAsync(x => x.AssemblyId == DemoSeedConstants.AssemblyOceanId
                                  && x.UserId == DemoSeedConstants.UserOwner101Id);
            p.IsAccredited.Should().BeTrue();
            p.AttendanceStatus.Should().Be(AttendanceStatus.Registered);
            p.AccreditedByUserId.Should().NotBeNull();
        }

        var quorumBefore = await president.GetAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/quorum");
        quorumBefore.EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence"))
            .EnsureSuccessStatusCode();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var p = await db.AssemblyParticipants.IgnoreQueryFilters()
                .SingleAsync(x => x.AssemblyId == DemoSeedConstants.AssemblyOceanId
                                  && x.UserId == DemoSeedConstants.UserOwner101Id);
            p.AttendanceStatus.Should().Be(AttendanceStatus.Present);
        }
    }

    [Fact(DisplayName = "Duplicate admin accredit is idempotent")]
    public async Task Duplicate_admin_accredit_is_idempotent()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        await AttendanceTestHelpers.AccreditAsync(
            president, DemoSeedConstants.AssemblyOceanId, DemoSeedConstants.UserOwner101Id);

        var again = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner101Id}/accredit",
            new AccreditRequest("Virtual", "OperatorCheckIn"));
        again.EnsureSuccessStatusCode();
        var body = await again.Content.ReadFromJsonAsync<AccreditResponse>();
        body!.IdempotentReplay.Should().BeTrue();
    }

    [Fact(DisplayName = "Presence without accreditation is rejected")]
    public async Task Presence_without_accreditation_fails()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var denied = await owner.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/presence");
        denied.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact(DisplayName = "Admin revoke clears accreditation and keeps historical votes intact path")]
    public async Task Admin_revoke_accreditation_resets_flags()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        await AttendanceTestHelpers.AccreditAsync(
            president, DemoSeedConstants.AssemblyOceanId, DemoSeedConstants.UserOwner101Id);

        var revoke = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner101Id}/deaccredit",
            new DeaccreditRequest("Correccion de mesa por error de acreditacion"));
        revoke.EnsureSuccessStatusCode();

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var p = await db.AssemblyParticipants.IgnoreQueryFilters()
            .SingleAsync(x => x.AssemblyId == DemoSeedConstants.AssemblyOceanId
                              && x.UserId == DemoSeedConstants.UserOwner101Id);
        p.IsAccredited.Should().BeFalse();
        p.AccreditedByUserId.Should().BeNull();
        p.AttendanceStatus.Should().Be(AttendanceStatus.Registered);
        p.EffectiveCoefficientPercent.Should().Be(0m);
    }
}
