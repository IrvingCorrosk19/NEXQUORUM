namespace Asambleas.Infrastructure.Tenancy;

using Asambleas.Application.Abstractions;
using Asambleas.Domain.Common;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

/// <summary>
/// Single source of truth for absolute links in outbound email.
/// Resolution order: ASAMBLEAS_PUBLIC_BASE_URL → App__PublicBaseUrl → App:PublicBaseUrl →
/// Development fallback https://localhost:7188.
/// </summary>
public sealed class PublicBaseUrlProvider : IPublicBaseUrlProvider
{
    public const string DevelopmentFallback = "https://localhost:7188";

    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;

    public PublicBaseUrlProvider(IConfiguration configuration, IHostEnvironment environment)
    {
        _configuration = configuration;
        _environment = environment;
    }

    public string? TryGetBaseUrl()
    {
        var configured = FirstNonEmpty(
            Environment.GetEnvironmentVariable("ASAMBLEAS_PUBLIC_BASE_URL"),
            Environment.GetEnvironmentVariable("App__PublicBaseUrl"),
            _configuration["App:PublicBaseUrl"]);

        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured.Trim().TrimEnd('/');
        }

        if (_environment.IsDevelopment())
        {
            return DevelopmentFallback;
        }

        return null;
    }

    public string BuildAbsoluteUrl(string path)
    {
        var baseUrl = TryGetBaseUrl();
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new DomainException(
                "PUBLIC_BASE_URL_MISSING",
                "Falta ASAMBLEAS_PUBLIC_BASE_URL. Configura la URL pública HTTPS de ASAMBLEAS (App:PublicBaseUrl).");
        }

        if (string.IsNullOrWhiteSpace(path))
        {
            return baseUrl;
        }

        var relative = path.StartsWith('/') ? path : "/" + path;
        return $"{baseUrl}{relative}";
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
}
