using System.Net;
using System.Net.Http.Json;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.SecurityTests;

[Collection(AsambleasCollection.Name)]
public sealed class AuthUrlSecurityTests
{
    private readonly AsambleasFixture _fixture;

    public AuthUrlSecurityTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Get_with_password_query_is_redirected_without_keeping_credentials()
    {
        var client = _fixture.Factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync("/?email=president%40ocean.demo&password=should-never-appear");

        response.StatusCode.Should().Be(HttpStatusCode.SeeOther);
        response.Headers.Location.Should().NotBeNull();
        var location = response.Headers.Location!.ToString();
        location.Should().Be("/");
        location.ToLowerInvariant().Should().NotContain("password");
        location.ToLowerInvariant().Should().NotContain("email=");
    }

    [Fact]
    public async Task Login_is_post_json_and_revoked_password_is_rejected()
    {
        var client = _fixture.Factory.CreateClient();
        var revoked = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { email = "president@ocean.demo", password = Asambleas.Infrastructure.Seed.DemoPasswordResolver.RevokedExposedPassword });

        revoked.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var ok = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        ok.User.Email.Should().Be("president@ocean.demo");
    }

    [Fact]
    public async Task Login_response_does_not_echo_password()
    {
        var auth = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var raw = await auth.Client.GetStringAsync("/api/auth/me");
        raw.ToLowerInvariant().Should().NotContain("\"password\"");
        raw.Should().NotContain(TestDemoCredentials.Password);
    }
}
