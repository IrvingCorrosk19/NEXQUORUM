namespace Asambleas.Infrastructure.Persistence;

using Asambleas.Infrastructure.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

/// <summary>
/// Design-time factory for <c>dotnet ef</c> migrations. Uses DefaultConnection from
/// environment, appsettings, or a local Docker Compose default.
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AsambleasDbContext>
{
    public AsambleasDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString =
            configuration.GetConnectionString("DefaultConnection")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=asambleas;Username=asambleas;Password=asambleas";

        var options = new DbContextOptionsBuilder<AsambleasDbContext>()
            .UseNpgsql(connectionString, npgsql =>
            {
                npgsql.MigrationsAssembly(typeof(AsambleasDbContext).Assembly.FullName);
                npgsql.MigrationsHistoryTable("__ef_migrations_history", "public");
            })
            .Options;

        // Empty tenant → query filters match no rows; migrations do not rely on filtered queries.
        return new AsambleasDbContext(options, new CurrentTenant());
    }
}
