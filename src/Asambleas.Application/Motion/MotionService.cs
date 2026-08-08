namespace Asambleas.Application.Motion;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Motions;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using MotionEntity = Asambleas.Domain.Entities.Motion;

public sealed class MotionService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;

    public MotionService(
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

    public async Task<IReadOnlyList<MotionDto>> ListAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var motions = await _db.Motions
            .AsNoTracking()
            .Where(m => m.AssemblyId == assemblyId)
            .OrderBy(m => m.Code)
            .ToListAsync(cancellationToken);

        return motions.Select(ToDto).ToList();
    }

    public async Task<MotionDto?> GetActiveAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var motion = await _db.Motions
            .AsNoTracking()
            .Where(m => m.AssemblyId == assemblyId
                        && (m.Status == MotionStatus.Presented || m.Status == MotionStatus.Voting))
            .OrderByDescending(m => m.UpdatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return motion is null ? null : ToDto(motion);
    }

    public async Task<MotionDto> GetByIdAsync(
        Guid assemblyId,
        Guid motionId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var motion = await _db.Motions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == motionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{motionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, motion.TenantId);
        return ToDto(motion);
    }

    public async Task<MotionDto> PresentMotionAsync(
        Guid assemblyId,
        Guid motionId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is not (AssemblyStatus.InProgress or AssemblyStatus.Paused))
        {
            throw new DomainException($"Motions cannot be presented while assembly is '{assembly.Status}'.");
        }

        var motion = await _db.Motions
            .FirstOrDefaultAsync(m => m.Id == motionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{motionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, motion.TenantId);

        if (motion.Status is not (MotionStatus.Draft or MotionStatus.Presented))
        {
            throw new DomainException($"Motion cannot be presented from status '{motion.Status}'.");
        }

        // One active presented motion: demote other Presented (not Voting) back to Draft.
        var otherPresented = await _db.Motions
            .Where(m => m.AssemblyId == assemblyId
                        && m.Id != motionId
                        && m.Status == MotionStatus.Presented)
            .ToListAsync(cancellationToken);
        foreach (var other in otherPresented)
        {
            other.Status = MotionStatus.Draft;
            other.UpdatedAtUtc = DateTimeOffset.UtcNow;
        }

        var openVoting = await _db.VotingSessions.AnyAsync(
            s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
            cancellationToken);
        if (openVoting)
        {
            throw new DomainException("Cannot present a motion while a voting session is open.");
        }

        motion.Status = MotionStatus.Presented;
        motion.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);

        var dto = ToDto(motion);

        await _audit.WriteAsync(
            AuditEventType.MotionPresented,
            assemblyId,
            metadata: new { motion.Id, motion.Code, motion.Title },
            cancellationToken: cancellationToken);

        await _realtime.PublishMotionAsync(assemblyId, dto, cancellationToken);

        return dto;
    }

    private static MotionDto ToDto(MotionEntity motion) =>
        new(
            motion.Id,
            motion.AssemblyId,
            motion.AgendaItemId,
            motion.Code,
            motion.Title,
            motion.Body,
            motion.Status.ToString());
}
