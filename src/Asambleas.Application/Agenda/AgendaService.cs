namespace Asambleas.Application.Agenda;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Agenda;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class AgendaService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;

    public AgendaService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
    }

    public async Task<AgendaListResponse> GetItemsAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var items = await _db.AgendaItems
            .AsNoTracking()
            .Where(i => i.AssemblyId == assemblyId)
            .OrderBy(i => i.Ordinal)
            .Select(i => new AgendaItemDto(
                i.Id,
                i.AssemblyId,
                i.Ordinal,
                i.Code,
                i.Title,
                i.IsActive))
            .ToListAsync(cancellationToken);

        return new AgendaListResponse(assemblyId, assembly.ActiveAgendaItemId, items);
    }

    public async Task<AgendaListResponse> SetActiveItemAsync(
        Guid assemblyId,
        Guid agendaItemId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException($"Cannot change agenda while assembly is '{assembly.Status}'.");
        }

        var openVoting = await _db.VotingSessions.AnyAsync(
            s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
            cancellationToken);
        if (openVoting)
        {
            throw new DomainException("Cannot change the agenda while a voting session is open.");
        }

        var items = await _db.AgendaItems
            .Where(i => i.AssemblyId == assemblyId)
            .OrderBy(i => i.Ordinal)
            .ToListAsync(cancellationToken);

        var target = items.FirstOrDefault(i => i.Id == agendaItemId)
            ?? throw new DomainException($"Agenda item '{agendaItemId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, target.TenantId);

        var now = DateTimeOffset.UtcNow;
        foreach (var item in items)
        {
            var shouldBeActive = item.Id == agendaItemId;
            if (item.IsActive != shouldBeActive)
            {
                item.IsActive = shouldBeActive;
                item.UpdatedAtUtc = now;
            }
        }

        assembly.ActiveAgendaItemId = agendaItemId;
        assembly.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);

        var response = new AgendaListResponse(
            assemblyId,
            agendaItemId,
            items.Select(i => new AgendaItemDto(
                i.Id,
                i.AssemblyId,
                i.Ordinal,
                i.Code,
                i.Title,
                i.IsActive)).ToList());

        await _audit.WriteAsync(
            AuditEventType.AgendaChanged,
            assemblyId,
            metadata: new { agendaItemId, target.Code, target.Title },
            cancellationToken: cancellationToken);

        await _realtime.PublishAgendaAsync(assemblyId, response, cancellationToken);

        return response;
    }
}
