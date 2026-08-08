using Asambleas.Application;
using Asambleas.Infrastructure;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddAsambleasApplication();

// Infrastructure requires a connection string when hosted; Workers may run without DB for heartbeat-only mode.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (!string.IsNullOrWhiteSpace(connectionString))
{
    builder.Services.AddAsambleasInfrastructure(builder.Configuration);
}

builder.Services.AddHostedService<HeartbeatWorker>();

var host = builder.Build();
await host.RunAsync();

/// <summary>
/// Placeholder worker documenting future jobs (quorum reconciliation, audit compaction, meeting cleanup).
/// </summary>
internal sealed class HeartbeatWorker : BackgroundService
{
    private readonly ILogger<HeartbeatWorker> _logger;

    public HeartbeatWorker(ILogger<HeartbeatWorker> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation(
            "Asambleas.Workers heartbeat started. Future jobs: quorum reconciliation, audit compaction, meeting cleanup.");

        while (!stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Workers heartbeat at {UtcNow:O}", DateTimeOffset.UtcNow);
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
