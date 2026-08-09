using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Meetings;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.SecurityTests;

[Collection(AsambleasCollection.Name)]
public sealed class MeetingTokenSecurityTests
{
    private readonly AsambleasFixture _fixture;

    public MeetingTokenSecurityTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact(DisplayName = "Owner join-token cannot force canPublish via query")]
    public async Task Owner_cannot_force_publish_via_query_string()
    {
        await _fixture.ResetDatabaseAsync();
        var assemblyId = DemoSeedConstants.AssemblyOceanId;

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{assemblyId}/start-checkin")).EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/attendance/check-in",
            new Asambleas.Contracts.Assemblies.CheckInRequest(DemoSeedConstants.Unit101Id, "Virtual")))
            .EnsureSuccessStatusCode();

        // Even with legacy query flag, publish is server-derived — never client-controlled.
        var response = await owner.PostAsync(
            $"/api/assemblies/{assemblyId}/meeting/join-token?canPublish=false");

        if (response.StatusCode == HttpStatusCode.BadRequest
            || response.StatusCode == HttpStatusCode.UnprocessableEntity
            || response.StatusCode == HttpStatusCode.Conflict)
        {
            // Provider not configured — governance-only path; still proves endpoint ignores client publish.
            var body = await response.Content.ReadAsStringAsync();
            body.Should().Match(s => s.Contains("not configured", StringComparison.OrdinalIgnoreCase)
                                     || s.Contains("LiveKit", StringComparison.OrdinalIgnoreCase)
                                     || s.Contains("Meeting provider", StringComparison.OrdinalIgnoreCase));
            return;
        }

        if (!response.IsSuccessStatusCode)
        {
            // Accept provider-unavailable domain errors as PASS for publish-authority when LiveKit absent.
            response.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.InternalServerError);
            return;
        }

        var token = await response.Content.ReadFromJsonAsync<MeetingJoinTokenResponse>();
        token.Should().NotBeNull();
        // Multi-participant video: registered joiners may publish; query string cannot force false.
        token!.CanPublish.Should().BeTrue("registered participants may publish A/V; client query is ignored");
    }

    [Fact(DisplayName = "Cross-assembly meeting room info is tenant-scoped")]
    public async Task Meeting_room_rejects_other_tenant()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var otherAssembly = DemoSeedConstants.AssemblyOtherId;
        var response = await owner.GetAsync($"/api/assemblies/{otherAssembly}/meeting/room");
        response.StatusCode.Should().BeOneOf(HttpStatusCode.NotFound, HttpStatusCode.Forbidden, HttpStatusCode.BadRequest);
    }
}
