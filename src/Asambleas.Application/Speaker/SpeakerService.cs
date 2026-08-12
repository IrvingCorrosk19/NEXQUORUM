namespace Asambleas.Application.Speaker;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Speakers;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

public sealed class SpeakerService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;

    public SpeakerService(
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

    public async Task<SpeakerRequestDto> RequestAsync(
        Guid assemblyId,
        CreateSpeakerRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is not (AssemblyStatus.InProgress or AssemblyStatus.Paused or AssemblyStatus.CheckIn))
        {
            throw new DomainException($"Speaker requests are not allowed while assembly is '{assembly.Status}'.");
        }

        var participant = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("Participant is not registered for this assembly.");

        var displayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? participant.DisplayName
            : request.DisplayName.Trim();

        // One active raise-hand per participant (multi-tab safe).
        var existing = await _db.SpeakerRequests
            .FirstOrDefaultAsync(
                s => s.AssemblyId == assemblyId
                     && s.UserId == userId
                     && s.Status == SpeakerRequestStatus.Requested,
                cancellationToken);
        if (existing is not null)
        {
            if (!string.Equals(existing.DisplayName, displayName, StringComparison.Ordinal)
                && !string.IsNullOrWhiteSpace(displayName))
            {
                existing.DisplayName = displayName;
                existing.UpdatedAtUtc = DateTimeOffset.UtcNow;
                await _db.SaveChangesAsync(cancellationToken);
                await PublishQueueAsync(assemblyId, cancellationToken);
            }

            return ToDto(existing);
        }

        if (await _db.SpeakerRequests.AnyAsync(
                s => s.AssemblyId == assemblyId
                     && s.UserId == userId
                     && s.Status == SpeakerRequestStatus.Granted,
                cancellationToken))
        {
            throw new DomainException("You already have the floor.");
        }

        var maxOrder = await _db.SpeakerRequests
            .Where(s => s.AssemblyId == assemblyId)
            .Select(s => (int?)s.QueueOrder)
            .MaxAsync(cancellationToken) ?? 0;

        var entity = new SpeakerRequest
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            UserId = userId,
            DisplayName = displayName,
            Status = SpeakerRequestStatus.Requested,
            RequestedAtUtc = DateTimeOffset.UtcNow,
            QueueOrder = maxOrder + 1
        };

        _db.SpeakerRequests.Add(entity);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.SpeakerRequested,
            assemblyId,
            metadata: new { entity.Id, entity.UserId, entity.QueueOrder },
            cancellationToken: cancellationToken);

        await PublishQueueAsync(assemblyId, cancellationToken);

        return ToDto(entity);
    }

    /// <summary>
    /// Participant lowers their own raised hand (cancels Requested only).
    /// </summary>
    public async Task<SpeakerRequestDto> CancelOwnAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var entity = await _db.SpeakerRequests
            .Where(s => s.AssemblyId == assemblyId
                        && s.UserId == userId
                        && s.Status == SpeakerRequestStatus.Requested)
            .OrderByDescending(s => s.QueueOrder)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new DomainException("No active speaker request to cancel.");

        entity.Status = SpeakerRequestStatus.Cancelled;
        entity.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.SpeakerCancelled,
            assemblyId,
            metadata: new { entity.Id, entity.UserId },
            cancellationToken: cancellationToken);

        await PublishQueueAsync(assemblyId, cancellationToken);

        return ToDto(entity);
    }

    public async Task<SpeakerRequestDto> GrantAsync(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);
        var entity = await RequireRequestAsync(assemblyId, speakerRequestId, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        TenantGuard.EnsureTenantMatch(_currentTenant, entity.TenantId);
        EnsureOperational(assembly);

        if (entity.Status != SpeakerRequestStatus.Requested)
        {
            throw new DomainException($"Speaker request cannot be granted from status '{entity.Status}'.");
        }

        var now = DateTimeOffset.UtcNow;

        var active = await _db.SpeakerRequests
            .Where(s => s.AssemblyId == assemblyId && s.Status == SpeakerRequestStatus.Granted)
            .ToListAsync(cancellationToken);

        foreach (var granted in active)
        {
            granted.Status = SpeakerRequestStatus.Completed;
            granted.CompletedAtUtc = now;
            granted.UpdatedAtUtc = now;
        }

        entity.Status = SpeakerRequestStatus.Granted;
        entity.GrantedAtUtc = now;
        entity.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.SpeakerGranted,
            assemblyId,
            metadata: new { entity.Id, entity.UserId },
            cancellationToken: cancellationToken);

        await PublishQueueAsync(assemblyId, cancellationToken);

        return ToDto(entity);
    }

    public async Task<SpeakerRequestDto> CompleteAsync(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);
        var entity = await RequireRequestAsync(assemblyId, speakerRequestId, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        TenantGuard.EnsureTenantMatch(_currentTenant, entity.TenantId);
        EnsureOperational(assembly);

        if (entity.Status != SpeakerRequestStatus.Granted)
        {
            throw new DomainException($"Speaker request cannot be completed from status '{entity.Status}'.");
        }

        var now = DateTimeOffset.UtcNow;
        entity.Status = SpeakerRequestStatus.Completed;
        entity.CompletedAtUtc = now;
        entity.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);
        await PublishQueueAsync(assemblyId, cancellationToken);

        return ToDto(entity);
    }

    public async Task<SpeakerRequestDto> RejectAsync(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);
        var entity = await RequireRequestAsync(assemblyId, speakerRequestId, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        TenantGuard.EnsureTenantMatch(_currentTenant, entity.TenantId);
        EnsureOperational(assembly);

        if (entity.Status is not (SpeakerRequestStatus.Requested or SpeakerRequestStatus.Granted))
        {
            throw new DomainException($"Speaker request cannot be rejected from status '{entity.Status}'.");
        }

        entity.Status = SpeakerRequestStatus.Rejected;
        entity.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.SpeakerRejected,
            assemblyId,
            metadata: new { entity.Id, entity.UserId },
            cancellationToken: cancellationToken);

        await PublishQueueAsync(assemblyId, cancellationToken);

        return ToDto(entity);
    }

    public async Task<SpeakerRequestDto> SkipAsync(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);
        var entity = await RequireRequestAsync(assemblyId, speakerRequestId, cancellationToken);
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        TenantGuard.EnsureTenantMatch(_currentTenant, entity.TenantId);
        EnsureOperational(assembly);

        if (entity.Status != SpeakerRequestStatus.Requested)
        {
            throw new DomainException($"Speaker request cannot be skipped from status '{entity.Status}'.");
        }

        entity.Status = SpeakerRequestStatus.Cancelled;
        entity.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.SpeakerSkipped,
            assemblyId,
            metadata: new { entity.Id, entity.UserId },
            cancellationToken: cancellationToken);

        await PublishQueueAsync(assemblyId, cancellationToken);

        return ToDto(entity);
    }

    public async Task<SpeakerQueueDto> GetQueueAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        return await BuildQueueAsync(assemblyId, cancellationToken);
    }

    private async Task PublishQueueAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        var queue = await BuildQueueAsync(assemblyId, cancellationToken);
        await _realtime.PublishSpeakerQueueAsync(assemblyId, queue, cancellationToken);
    }

    private async Task<SpeakerQueueDto> BuildQueueAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        var items = await _db.SpeakerRequests
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId)
            .OrderBy(s => s.QueueOrder)
            .ThenBy(s => s.RequestedAtUtc)
            .ToListAsync(cancellationToken);

        var current = items.FirstOrDefault(s => s.Status == SpeakerRequestStatus.Granted);

        return new SpeakerQueueDto(
            assemblyId,
            current?.Id,
            items.Select(ToDto).ToList());
    }

    private async Task<AssemblyEntity> RequireAssemblyAsync(Guid assemblyId, CancellationToken cancellationToken) =>
        await _db.Assemblies.FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
        ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

    private static void EnsureOperational(AssemblyEntity assembly)
    {
        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException(
                "ASSEMBLY_SEALED",
                $"Speaker operations are not allowed while assembly is '{assembly.Status}'.");
        }
    }
    private async Task<SpeakerRequest> RequireRequestAsync(
        Guid assemblyId,
        Guid speakerRequestId,
        CancellationToken cancellationToken) =>
        await _db.SpeakerRequests.FirstOrDefaultAsync(
            s => s.Id == speakerRequestId && s.AssemblyId == assemblyId,
            cancellationToken)
        ?? throw new DomainException($"Speaker request '{speakerRequestId}' was not found.");

    private static SpeakerRequestDto ToDto(SpeakerRequest entity) =>
        new(
            entity.Id,
            entity.AssemblyId,
            entity.UserId,
            entity.DisplayName,
            entity.Status.ToString(),
            entity.RequestedAtUtc,
            entity.GrantedAtUtc,
            entity.CompletedAtUtc,
            entity.QueueOrder);
}
