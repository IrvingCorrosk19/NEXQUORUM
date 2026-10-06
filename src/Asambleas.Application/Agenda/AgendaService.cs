namespace Asambleas.Application.Agenda;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Agenda;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
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
                i.IsActive,
                i.CompletedAtUtc != null))
            .ToListAsync(cancellationToken);

        return new AgendaListResponse(assemblyId, assembly.ActiveAgendaItemId, items);
    }

    public async Task<AgendaListResponse> CompleteActiveItemAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        EnsureAgendaMutable(assembly);

        var items = await _db.AgendaItems
            .Where(i => i.AssemblyId == assemblyId)
            .OrderBy(i => i.Ordinal)
            .ToListAsync(cancellationToken);

        var current = items.FirstOrDefault(i => i.IsActive)
            ?? items.FirstOrDefault(i => i.Id == assembly.ActiveAgendaItemId)
            ?? throw new DomainException("No hay un punto de agenda activo para finalizar.");

        await EnsureItemCanAdvanceAsync(assemblyId, current.Id, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        FinishItem(current, now);
        var next = NextOpenItem(items, current);
        ActivateOnly(items, next, now);
        assembly.ActiveAgendaItemId = next?.Id;
        assembly.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);
        return await PublishAsync(assemblyId, items, current, cancellationToken);
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

        EnsureAgendaMutable(assembly);

        var items = await _db.AgendaItems
            .Where(i => i.AssemblyId == assemblyId)
            .OrderBy(i => i.Ordinal)
            .ToListAsync(cancellationToken);

        var target = items.FirstOrDefault(i => i.Id == agendaItemId)
            ?? throw new DomainException($"Agenda item '{agendaItemId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, target.TenantId);

        if (target.CompletedAtUtc is not null)
        {
            throw new DomainException("Ese punto de agenda ya está finalizado.");
        }

        var current = items.FirstOrDefault(i => i.IsActive);
        var now = DateTimeOffset.UtcNow;
        if (current is not null && current.Id != target.Id)
        {
            await EnsureItemCanAdvanceAsync(assemblyId, current.Id, cancellationToken);
            var next = NextOpenItem(items, current);
            if (next is null || next.Id != target.Id)
            {
                throw new DomainException(
                    "AGENDA_MUST_FINISH",
                    "Finalice el punto actual para avanzar al siguiente.");
            }

            FinishItem(current, now);
        }
        else
        {
            await EnsureNoOpenVotingAsync(assemblyId, cancellationToken);
        }

        ActivateOnly(items, target, now);
        assembly.ActiveAgendaItemId = target.Id;
        assembly.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);
        return await PublishAsync(assemblyId, items, target, cancellationToken);
    }

    public async Task<AgendaListResponse> CreateItemAsync(
        Guid assemblyId,
        CreateAgendaItemRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        ArgumentNullException.ThrowIfNull(request);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException("Cannot add agenda items to a closed assembly.");
        }

        var title = (request.Title ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(title))
        {
            throw new DomainException("Agenda title is required.");
        }

        var code = string.IsNullOrWhiteSpace(request.Code)
            ? $"A{(request.Ordinal > 0 ? request.Ordinal : await NextOrdinalAsync(assemblyId, cancellationToken)):00}"
            : request.Code.Trim();

        if (code.Length > 64)
        {
            throw new DomainException("Agenda code exceeds maximum length.");
        }

        var ordinal = request.Ordinal > 0
            ? request.Ordinal
            : await NextOrdinalAsync(assemblyId, cancellationToken);

        var clash = await _db.AgendaItems.AnyAsync(
            i => i.AssemblyId == assemblyId && (i.Code == code || i.Ordinal == ordinal),
            cancellationToken);
        if (clash)
        {
            throw new DomainException("Agenda code or ordinal already exists.");
        }

        var item = new Domain.Entities.AgendaItem
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            Ordinal = ordinal,
            Code = code,
            Title = title.Length > 512 ? title[..512] : title,
            IsActive = false
        };

        _db.AgendaItems.Add(item);
        await _db.SaveChangesAsync(cancellationToken);

        return await GetItemsAsync(assemblyId, cancellationToken);
    }

    private static void EnsureAgendaMutable(Domain.Entities.Assembly assembly)
    {
        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException($"Cannot change agenda while assembly is '{assembly.Status}'.");
        }
    }

    private static void FinishItem(AgendaItem item, DateTimeOffset now)
    {
        item.IsActive = false;
        item.CompletedAtUtc ??= now;
        item.UpdatedAtUtc = now;
    }

    private static AgendaItem? NextOpenItem(IReadOnlyList<AgendaItem> items, AgendaItem current) =>
        items
            .Where(i => i.Id != current.Id && i.Ordinal > current.Ordinal && i.CompletedAtUtc is null)
            .OrderBy(i => i.Ordinal)
            .FirstOrDefault();

    private static void ActivateOnly(IReadOnlyList<AgendaItem> items, AgendaItem? active, DateTimeOffset now)
    {
        foreach (var item in items)
        {
            var shouldBeActive = active is not null && item.Id == active.Id;
            if (item.IsActive == shouldBeActive)
            {
                continue;
            }

            item.IsActive = shouldBeActive;
            item.UpdatedAtUtc = now;
        }
    }

    private async Task EnsureItemCanAdvanceAsync(
        Guid assemblyId,
        Guid agendaItemId,
        CancellationToken cancellationToken)
    {
        await EnsureNoOpenVotingAsync(assemblyId, cancellationToken);

        var pending = await _db.Motions.AnyAsync(
            m => m.AssemblyId == assemblyId
                 && m.AgendaItemId == agendaItemId
                 && m.DesignStatus != VotingDesignCodes.DesignStatus.Archived
                 && m.Status != MotionStatus.Approved
                 && m.Status != MotionStatus.Rejected
                 && m.Status != MotionStatus.Cancelled
                 && m.Status != MotionStatus.NoValidDecision,
            cancellationToken);
        if (pending)
        {
            throw new DomainException(
                "AGENDA_ITEM_PENDING",
                "No se puede finalizar este punto: tiene preguntas o mociones pendientes.");
        }
    }

    private async Task EnsureNoOpenVotingAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        var openVoting = await _db.VotingSessions.AnyAsync(
            s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
            cancellationToken);
        if (openVoting)
        {
            throw new DomainException(
                "AGENDA_VOTING_OPEN",
                "No se puede avanzar de punto mientras hay una votación abierta.");
        }
    }

    private async Task<AgendaListResponse> PublishAsync(
        Guid assemblyId,
        IReadOnlyList<AgendaItem> items,
        AgendaItem focus,
        CancellationToken cancellationToken)
    {
        var activeId = items.FirstOrDefault(i => i.IsActive)?.Id;
        var response = new AgendaListResponse(
            assemblyId,
            activeId,
            items.Select(i => new AgendaItemDto(
                i.Id,
                i.AssemblyId,
                i.Ordinal,
                i.Code,
                i.Title,
                i.IsActive,
                i.CompletedAtUtc != null)).ToList());

        await _audit.WriteAsync(
            AuditEventType.AgendaChanged,
            assemblyId,
            metadata: new { agendaItemId = focus.Id, focus.Code, focus.Title, focus.IsActive, isCompleted = focus.CompletedAtUtc != null },
            cancellationToken: cancellationToken);

        await _realtime.PublishAgendaAsync(assemblyId, response, cancellationToken);
        return response;
    }

    private async Task<int> NextOrdinalAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        var max = await _db.AgendaItems
            .Where(i => i.AssemblyId == assemblyId)
            .Select(i => (int?)i.Ordinal)
            .MaxAsync(cancellationToken);
        return (max ?? 0) + 1;
    }
}
