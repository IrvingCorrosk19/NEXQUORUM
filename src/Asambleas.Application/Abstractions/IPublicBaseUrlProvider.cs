namespace Asambleas.Application.Abstractions;

/// <summary>
/// Resolves the public HTTPS base URL used in outbound emails (activation, convocations).
/// </summary>
public interface IPublicBaseUrlProvider
{
    /// <summary>Configured public base (may be empty before validation).</summary>
    string? TryGetBaseUrl();

    /// <summary>
    /// Builds an absolute URL for an app-relative path (e.g. /activate.html?token=…).
    /// Throws DomainException when the public base URL is not configured outside Development.
    /// </summary>
    string BuildAbsoluteUrl(string path);
}
