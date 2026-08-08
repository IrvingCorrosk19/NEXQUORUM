using System.Net;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.SecurityTests;

/// <summary>
/// Security gate: CROSS_TENANT_LEAKS must remain 0 (no successful foreign-tenant payload).
/// </summary>
[Collection(AsambleasCollection.Name)]
public sealed class AuthorizationTests
{
    private readonly AsambleasFixture _fixture;

    public AuthorizationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Unauthenticated_api_returns_401()
    {
        await _fixture.ResetDatabaseAsync();

        var client = _fixture.Factory.CreateClient();
        var response = await client.GetAsync($"/api/assemblies/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Unauthenticated_voting_cast_returns_401()
    {
        await _fixture.ResetDatabaseAsync();

        var client = _fixture.Factory.CreateClient();
        var response = await client.PostAsync(
            $"/api/assemblies/{Guid.NewGuid()}/voting/{Guid.NewGuid()}/cast",
            new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
