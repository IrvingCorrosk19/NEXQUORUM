namespace Asambleas.IntegrationTests.Infrastructure;

/// <summary>
/// Demo password for automated tests only. Never equal to a password previously exposed in URLs.
/// Override with ASAMBLEAS_DEMO_PASSWORD when needed.
/// </summary>
public static class TestDemoCredentials
{
    public const string DefaultPassword = "Asambleas.TestHarness!2026Qx";

    public static string Password =>
        Environment.GetEnvironmentVariable("ASAMBLEAS_DEMO_PASSWORD")
        ?? Environment.GetEnvironmentVariable("DEMO_PASSWORD")
        ?? DefaultPassword;
}
