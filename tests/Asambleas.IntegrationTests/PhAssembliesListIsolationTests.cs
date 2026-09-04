using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class PhAssembliesListIsolationTests
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly AsambleasFixture _fixture;

    public PhAssembliesListIsolationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task List_create_and_cross_ph_isolation_for_president()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        var phBRes = await president.PostJsonAsync("/api/ph", new
        {
            name = "PH B Isolation Cert",
            code = "PHBISO" + DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            timeZoneId = "America/Panama",
            country = "PA"
        });
        phBRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var phB = await phBRes.Content.ReadFromJsonAsync<PhDto>(JsonOpts);
        phB.Should().NotBeNull();

        var phA = DemoSeedConstants.PhOceanId;
        await SwitchPhAsync(president, phA);

        var startA = DateTimeOffset.UtcNow.AddDays(5);
        var createA = await president.PostJsonAsync("/api/assemblies", new
        {
            propertyHorizontalId = phA,
            title = "A1 Isolation",
            modality = "VIRTUAL",
            assemblyKind = "ORDINARY",
            scheduledAtUtc = startA,
            estimatedEndAtUtc = startA.AddHours(2),
            requiredQuorumPercent = 50,
            publishAsScheduled = false
        });
        createA.StatusCode.Should().Be(HttpStatusCode.OK);
        var a1 = await createA.Content.ReadFromJsonAsync<AsmDto>(JsonOpts);
        a1!.PropertyHorizontalId.Should().Be(phA);
        a1.Status.Should().Be("Draft");

        var spoof = await president.PostJsonAsync("/api/assemblies", new
        {
            propertyHorizontalId = phB!.Id,
            title = "Spoof B",
            modality = "VIRTUAL",
            assemblyKind = "ORDINARY",
            scheduledAtUtc = startA.AddDays(1),
            estimatedEndAtUtc = startA.AddDays(1).AddHours(2),
            requiredQuorumPercent = 50,
            publishAsScheduled = true
        });
        spoof.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var listA = await ListEventsAsync(president, phA);
        listA.Select(e => e.AssemblyId).Should().Contain(a1.Id);
        listA.Should().OnlyContain(e => e.PropertyHorizontalId == phA);

        var crossList = await president.GetAsync(EventsUrl(phB.Id));
        crossList.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        await SwitchPhAsync(president, phB.Id);
        var startB = DateTimeOffset.UtcNow.AddDays(6);
        var createB = await president.PostJsonAsync("/api/assemblies", new
        {
            propertyHorizontalId = phB.Id,
            title = "B1 Isolation",
            modality = "VIRTUAL",
            assemblyKind = "ORDINARY",
            scheduledAtUtc = startB,
            estimatedEndAtUtc = startB.AddHours(2),
            requiredQuorumPercent = 50,
            publishAsScheduled = true
        });
        createB.StatusCode.Should().Be(HttpStatusCode.OK);
        var b1 = await createB.Content.ReadFromJsonAsync<AsmDto>(JsonOpts);
        b1.Should().NotBeNull();

        var listB = await ListEventsAsync(president, phB.Id);
        listB.Select(e => e.Title).Should().Contain("B1 Isolation");
        listB.Should().NotContain(e => e.AssemblyId == a1.Id);
        listB.Should().OnlyContain(e => e.PropertyHorizontalId == phB.Id);

        await SwitchPhAsync(president, phA);
        var noFilter = await ListEventsAsync(president, phId: null);
        noFilter.Should().OnlyContain(e => e.PropertyHorizontalId == phA);
        noFilter.Should().NotContain(e => e.AssemblyId == b1!.Id);
    }

    private static string EventsUrl(Guid? phId)
    {
        var from = DateTimeOffset.UtcNow.AddMonths(-6).ToString("o");
        var to = DateTimeOffset.UtcNow.AddMonths(12).ToString("o");
        var q = $"/api/calendar/events?from={Uri.EscapeDataString(from)}&to={Uri.EscapeDataString(to)}";
        if (phId is Guid id) q += $"&propertyHorizontalId={id:D}";
        return q;
    }

    private static async Task SwitchPhAsync(AuthenticatedClient client, Guid phId)
    {
        var res = await client.PostJsonAsync("/api/ph/switch", new { propertyHorizontalId = phId });
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        await client.RefreshAntiforgeryAsync();
    }

    private static async Task<List<EventDto>> ListEventsAsync(AuthenticatedClient client, Guid? phId)
    {
        var res = await client.GetAsync(EventsUrl(phId));
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<ListBody>(JsonOpts);
        return body?.Events?.ToList() ?? [];
    }

    private sealed record PhDto(Guid Id, string Name);
    private sealed record AsmDto(Guid Id, Guid PropertyHorizontalId, string Status, string Title);
    private sealed record EventDto(Guid AssemblyId, Guid PropertyHorizontalId, string Title, string Status);
    private sealed record ListBody(IReadOnlyList<EventDto> Events);
}
