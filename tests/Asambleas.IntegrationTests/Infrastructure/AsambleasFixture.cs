using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests.Infrastructure;

/// <summary>
/// Resolves the test PostgreSQL connection without hardcoding passwords in source.
/// Preference order:
/// 1. ASAMBLEAS_TEST_CONNECTION
/// 2. ConnectionStrings__DefaultConnection
/// 3. Host/user defaults + PGPASSWORD (or empty password)
/// </summary>
public static class TestConnectionString
{
    public const string DefaultDatabase = "asambleas_tests";

    public static string Resolve()
    {
        var explicitCs = Environment.GetEnvironmentVariable("ASAMBLEAS_TEST_CONNECTION");
        if (!string.IsNullOrWhiteSpace(explicitCs))
        {
            return explicitCs.Trim();
        }

        var defaultCs = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
        if (!string.IsNullOrWhiteSpace(defaultCs))
        {
            return defaultCs.Trim();
        }

        var password = Environment.GetEnvironmentVariable("PGPASSWORD") ?? string.Empty;
        return $"Host=127.0.0.1;Port=5432;Database={DefaultDatabase};Username=postgres;Password={password}";
    }

    public static void EnsureLooksLikeTestDatabase(string connectionString)
    {
        if (!connectionString.Contains(DefaultDatabase, StringComparison.OrdinalIgnoreCase)
            && !connectionString.Contains("_tests", StringComparison.OrdinalIgnoreCase)
            && !connectionString.Contains("asambleas_test", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Refusing to reset database that does not look like a test DB. " +
                $"Expected name containing '{DefaultDatabase}' or '_tests'. " +
                $"Set ASAMBLEAS_TEST_CONNECTION or ConnectionStrings__DefaultConnection.");
        }
    }
}

public sealed class AsambleasWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString;

    public AsambleasWebApplicationFactory(string? connectionString = null)
    {
        _connectionString = connectionString ?? TestConnectionString.Resolve();
    }

    public string ConnectionString => _connectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = _connectionString,
                ["Demo:Enabled"] = "true",
                ["Demo:PublicUserList"] = "true"
            });
        });
    }
}

[CollectionDefinition(Name)]
public sealed class AsambleasCollection : ICollectionFixture<AsambleasFixture>
{
    public const string Name = "Asambleas integration";
}

public sealed class AsambleasFixture : IAsyncLifetime
{
    public AsambleasWebApplicationFactory Factory { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        var cs = TestConnectionString.Resolve();
        TestConnectionString.EnsureLooksLikeTestDatabase(cs);

        Environment.SetEnvironmentVariable("ConnectionStrings__DefaultConnection", cs);

        Factory = new AsambleasWebApplicationFactory(cs);

        // Force host creation, then reset to a clean migrated+seeded state.
        _ = Factory.Services;

        await ResetDatabaseAsync();
    }

    public async Task ResetDatabaseAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var seeder = scope.ServiceProvider.GetRequiredService<DemoDataSeeder>();

        TestConnectionString.EnsureLooksLikeTestDatabase(Factory.ConnectionString);

        await db.Database.EnsureDeletedAsync();
        await db.Database.MigrateAsync();
        await seeder.SeedAsync();
    }

    public async Task DisposeAsync()
    {
        await Factory.DisposeAsync();
    }
}
