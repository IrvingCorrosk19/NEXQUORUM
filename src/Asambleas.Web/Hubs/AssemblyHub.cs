namespace Asambleas.Web.Hubs;

using System.Security.Claims;
using Asambleas.Application.Assembly;
using Asambleas.Application.Attendance;
using Asambleas.Application.Meeting;
using Asambleas.Domain.Common;
using Asambleas.Infrastructure.Tenancy;
using Asambleas.Web.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

[Authorize]
public sealed class AssemblyHub : Hub
{
    public const string AssemblyGroupPrefix = "assembly:";
    private const string AssemblyItemKey = "AssemblyId";

    private readonly AttendanceService _attendance;
    private readonly AssemblyAccessService _access;
    private readonly MeetingService _meetings;
    private readonly CurrentTenant _currentTenant;
    private readonly ILogger<AssemblyHub> _logger;

    public AssemblyHub(
        AttendanceService attendance,
        AssemblyAccessService access,
        MeetingService meetings,
        CurrentTenant currentTenant,
        ILogger<AssemblyHub> logger)
    {
        _attendance = attendance;
        _access = access;
        _meetings = meetings;
        _currentTenant = currentTenant;
        _logger = logger;
    }

    public static string GroupName(Guid assemblyId) => $"{AssemblyGroupPrefix}{assemblyId:D}";

    public async Task JoinAssembly(Guid assemblyId)
    {
        var userId = RequireUserId();
        EnsureTenantContextFromClaims();

        var tenantId = _currentTenant.TenantId;
        var permissions = Context.User?
            .FindAll(AsambleasClaimTypes.Permission)
            .Select(c => c.Value)
            .ToArray()
            ?? [];

        Domain.Enums.AssemblyStatus status;
        try
        {
            status = await _access.EnsureCanObserveAssemblyAsync(
                assemblyId,
                userId,
                tenantId,
                permissions,
                Context.ConnectionAborted);
        }
        catch (DomainException ex)
        {
            throw new HubException(ex.Message);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(assemblyId));
        Context.Items[AssemblyItemKey] = assemblyId;

        // Terminal assemblies: observe-only — never MarkConnected / quorum mutation.
        if (!AssemblyAccessService.AllowsPresenceMutation(status))
        {
            _logger.LogInformation(
                "SignalR observe-only join for sealed assembly {AssemblyId} status {Status}",
                assemblyId,
                status);
            return;
        }

        try
        {
            await _attendance.MarkConnectedAsync(assemblyId, userId, Context.ConnectionAborted);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MarkConnected failed for assembly {AssemblyId} user {UserId}", assemblyId, userId);
        }
    }

    public async Task LeaveAssembly(Guid assemblyId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(assemblyId));
        Context.Items.Remove(AssemblyItemKey);

        if (!TryGetUserId(out var userId))
        {
            return;
        }

        EnsureTenantContextFromClaims();
        try
        {
            var status = await _access.EnsureCanObserveAssemblyAsync(
                assemblyId,
                userId,
                _currentTenant.TenantId,
                Context.User?
                    .FindAll(AsambleasClaimTypes.Permission)
                    .Select(c => c.Value)
                    .ToArray()
                ?? [],
                Context.ConnectionAborted);

            if (!AssemblyAccessService.AllowsPresenceMutation(status))
            {
                return;
            }

            await _attendance.MarkDisconnectedAsync(assemblyId, userId, Context.ConnectionAborted);
            await _meetings.ClearIfPresenterLeftAsync(assemblyId, userId, Context.ConnectionAborted);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MarkDisconnected failed for assembly {AssemblyId} user {UserId}", assemblyId, userId);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items.TryGetValue(AssemblyItemKey, out var value)
            && value is Guid assemblyId
            && TryGetUserId(out var userId))
        {
            EnsureTenantContextFromClaims();
            try
            {
                var permissions = Context.User?
                    .FindAll(AsambleasClaimTypes.Permission)
                    .Select(c => c.Value)
                    .ToArray()
                    ?? [];

                var status = await _access.EnsureCanObserveAssemblyAsync(
                    assemblyId,
                    userId,
                    _currentTenant.TenantId,
                    permissions,
                    CancellationToken.None);

                if (AssemblyAccessService.AllowsPresenceMutation(status))
                {
                    await _attendance.MarkDisconnectedAsync(assemblyId, userId, CancellationToken.None);
                    await _meetings.ClearIfPresenterLeftAsync(assemblyId, userId, CancellationToken.None);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "MarkDisconnected on disconnect failed for assembly {AssemblyId}", assemblyId);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    private void EnsureTenantContextFromClaims()
    {
        var user = Context.User;
        if (user?.Identity?.IsAuthenticated != true)
        {
            return;
        }

        _currentTenant.IsAuthenticated = true;
        _currentTenant.UserId = ParseGuid(user, ClaimTypes.NameIdentifier) ?? ParseGuid(user, "sub");
        _currentTenant.TenantId = ParseGuid(user, AsambleasClaimTypes.TenantId) ?? Guid.Empty;
        _currentTenant.OrganizationId = ParseGuid(user, AsambleasClaimTypes.OrganizationId);
        _currentTenant.PropertyHorizontalId = ParseGuid(user, AsambleasClaimTypes.PropertyHorizontalId);
        _currentTenant.DisplayName = user.FindFirstValue(ClaimTypes.Name) ?? user.Identity?.Name;
        _currentTenant.Roles = user.FindAll(ClaimTypes.Role).Select(c => c.Value).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        _currentTenant.Permissions = user.FindAll(AsambleasClaimTypes.Permission).Select(c => c.Value).Distinct(StringComparer.Ordinal).ToArray();
    }

    private Guid RequireUserId()
    {
        if (!TryGetUserId(out var userId))
        {
            throw new HubException("Authenticated user is required.");
        }

        return userId;
    }

    private bool TryGetUserId(out Guid userId)
    {
        var raw = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? Context.User?.FindFirstValue("sub");
        return Guid.TryParse(raw, out userId);
    }

    private static Guid? ParseGuid(ClaimsPrincipal user, string claimType)
    {
        var value = user.FindFirstValue(claimType);
        return Guid.TryParse(value, out var id) ? id : null;
    }
}
