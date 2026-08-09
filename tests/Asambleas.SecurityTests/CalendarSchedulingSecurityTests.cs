using Asambleas.Application.Security;
using Asambleas.Contracts.Calendar;
using Asambleas.Infrastructure.Seed;
using FluentAssertions;
using System.Net;
using System.Net.Http.Json;

namespace Asambleas.SecurityTests;

[Collection(Asambleas.IntegrationTests.Infrastructure.AsambleasCollection.Name)]
public sealed class CalendarSchedulingSecurityTests
{
    private static readonly System.Text.Json.JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
    private readonly Asambleas.IntegrationTests.Infrastructure.AsambleasFixture _fixture;

    public CalendarSchedulingSecurityTests(Asambleas.IntegrationTests.Infrastructure.AsambleasFixture fixture) =>
        _fixture = fixture;

    [Fact(DisplayName = "Owner cannot reschedule assembly")]
    public async Task Owner_cannot_reschedule()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await Asambleas.IntegrationTests.Infrastructure.AuthenticatedClient.LoginAsync(
            _fixture.Factory, "owner101@ocean.demo");
        var id = DemoSeedConstants.AssemblyOceanId;
        var res = await owner.PostJsonAsync(
            $"/api/assemblies/{id}/reschedule",
            new RescheduleAssemblyRequest(
                DateTimeOffset.UtcNow.AddDays(3),
                null,
                "Owner attempt",
                false,
                null));
        res.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.Unauthorized);
    }

    [Fact(DisplayName = "Cross-tenant calendar event is not leaked")]
    public async Task Cross_tenant_event_hidden()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await Asambleas.IntegrationTests.Infrastructure.AuthenticatedClient.LoginAsync(
            _fixture.Factory, "president@ocean.demo");
        var other = DemoSeedConstants.AssemblyOtherId;
        var res = await president.GetAsync($"/api/calendar/events/{other}");
        res.IsSuccessStatusCode.Should().BeFalse();
        var body = await res.Content.ReadAsStringAsync();
        body.Should().NotContain("OTHER");
    }

    [Fact(DisplayName = "President can reschedule with history and reminder rebuild")]
    public async Task President_reschedule_creates_history()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await Asambleas.IntegrationTests.Infrastructure.AuthenticatedClient.LoginAsync(
            _fixture.Factory, "president@ocean.demo");
        var id = DemoSeedConstants.AssemblyOceanId;
        var when = DateTimeOffset.UtcNow.AddDays(5);
        var res = await president.PostJsonAsync(
            $"/api/assemblies/{id}/reschedule",
            new RescheduleAssemblyRequest(when, when.AddHours(2), "Conflicto de sala", true, null));
        res.EnsureSuccessStatusCode();
        var ev = await res.Content.ReadFromJsonAsync<CalendarEventDto>(Json);
        ev!.WasRescheduled.Should().BeTrue();
        ev.ScheduledAtUtc.Should().BeCloseTo(when, TimeSpan.FromMinutes(1));

        var hist = await president.GetAsync($"/api/assemblies/{id}/schedule-history");
        hist.EnsureSuccessStatusCode();
        var rows = await hist.Content.ReadFromJsonAsync<List<ScheduleChangeDto>>(Json);
        rows!.Should().NotBeEmpty();
        rows[0].Reason.Should().Contain("Conflicto");
    }
}
