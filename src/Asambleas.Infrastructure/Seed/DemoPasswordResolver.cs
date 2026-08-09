namespace Asambleas.Infrastructure.Seed;

using Microsoft.Extensions.Configuration;

/// <summary>
/// Resolves demo/pilot passwords from configuration or environment — never hardcode production secrets.
/// </summary>
public static class DemoPasswordResolver
{
    public const string ConfigKey = "Demo:Password";
    public const string EnvironmentVariableName = "ASAMBLEAS_DEMO_PASSWORD";

    /// <summary>
    /// Historically exposed pilot password. Must never authenticate successfully after rotation.
    /// </summary>
    public const string RevokedExposedPassword = "Demo!Pass123";

    public static string ResolveRequired(IConfiguration configuration)
    {
        var password = FirstNonEmpty(
            configuration[ConfigKey],
            Environment.GetEnvironmentVariable(EnvironmentVariableName),
            Environment.GetEnvironmentVariable("DEMO_PASSWORD"));

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException(
                "Demo password is not configured. Set Demo:Password or ASAMBLEAS_DEMO_PASSWORD.");
        }

        if (string.Equals(password, RevokedExposedPassword, StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "Refusing to use the revoked exposed demo password. Configure a new Demo:Password.");
        }

        return password;
    }

    public static string? TryResolve(IConfiguration configuration)
    {
        try
        {
            return ResolveRequired(configuration);
        }
        catch
        {
            return null;
        }
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
}
