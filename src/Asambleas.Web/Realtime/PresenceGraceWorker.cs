namespace Asambleas.Web.Realtime;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Attendance;
using Asambleas.Infrastructure.Tenancy;

/// <summary>
/// Promotes an unexpected disconnect to Left after the grace window, then refreshes quorum.
/// </summary>
public sealed class PresenceGraceWorker : BackgroundService
{
    private static readonly TimeSpan SweepEvery = TimeSpan.FromSeconds(10);

    private readonly IAssemblyHubPresence _presence;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<PresenceGraceWorker> _logger;

    public PresenceGraceWorker(
        IAssemblyHubPresence presence,
        IServiceScopeFactory scopes,
        ILogger<PresenceGraceWorker> logger)
    {
        _presence = presence;
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(SweepEvery, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            var due = _presence.TakeExpiredDisconnectGrace(DateTimeOffset.UtcNow);
            foreach (var item in due)
            {
                if (_presence.IsHubConnected(item.AssemblyId, item.UserId))
                {
                    continue;
                }

                try
                {
                    using var scope = _scopes.CreateScope();
                    var tenant = scope.ServiceProvider.GetRequiredService<CurrentTenant>();
                    tenant.IsAuthenticated = true;
                    tenant.TenantId = item.TenantId;
                    tenant.UserId = item.UserId;
                    var attendance = scope.ServiceProvider.GetRequiredService<AttendanceService>();
                    await attendance.FinalizeGraceDisconnectAsync(item.AssemblyId, item.UserId, stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogWarning(
                        ex,
                        "Grace disconnect failed for assembly {AssemblyId} user {UserId}",
                        item.AssemblyId,
                        item.UserId);
                }
            }
        }
    }
}
