using System.Net.Http.Json;
using System.Text.Json;
using Asambleas.Contracts.Auth;
using Asambleas.Infrastructure.Seed;

namespace Asambleas.IntegrationTests.Infrastructure;

public sealed class AuthenticatedClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public HttpClient Client { get; }
    public string AntiforgeryToken { get; private set; } = string.Empty;
    public LoginResponse User { get; private set; } = null!;

    private AuthenticatedClient(HttpClient client)
    {
        Client = client;
    }

    public static async Task<AuthenticatedClient> LoginAsync(
        AsambleasWebApplicationFactory factory,
        string email,
        string? password = null)
    {
        var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

        var auth = new AuthenticatedClient(client);
        await auth.RefreshAntiforgeryAsync();

        var loginResponse = await client.PostAsJsonAsync(
            "/api/auth/login",
            new LoginRequest(email, password ?? DemoSeedConstants.DemoPassword));

        loginResponse.EnsureSuccessStatusCode();
        auth.User = (await loginResponse.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions))!;
        await auth.RefreshAntiforgeryAsync();
        return auth;
    }

    public async Task RefreshAntiforgeryAsync()
    {
        var response = await Client.GetAsync("/api/auth/antiforgery");
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        AntiforgeryToken = doc.RootElement.GetProperty("requestToken").GetString()
            ?? throw new InvalidOperationException("Antiforgery requestToken missing.");
    }

    public async Task<HttpResponseMessage> PostJsonAsync<T>(string url, T body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.TryAddWithoutValidation("RequestVerificationToken", AntiforgeryToken);
        return await Client.SendAsync(request);
    }

    public Task<HttpResponseMessage> PostAsync(string url) =>
        PostJsonAsync(url, new { });

    public Task<HttpResponseMessage> GetAsync(string url) => Client.GetAsync(url);
}
