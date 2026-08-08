namespace Asambleas.Application.Quorum;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Quorum;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Quorum;
using Microsoft.EntityFrameworkCore;

public sealed class QuorumService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;

    public QuorumService(
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

    public async Task<QuorumDto?> GetLatestAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var latest = await _db.QuorumSnapshots
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId)
            .OrderByDescending(s => s.TimestampUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (latest is not null)
        {
            var eligibleUnits = await _db.Units
                .AsNoTracking()
                .CountAsync(
                    u => u.TenantId == assembly.TenantId && u.PropertyHorizontalId == assembly.PropertyHorizontalId,
                    cancellationToken);

            return new QuorumDto(
                assemblyId,
                latest.PresentCoefficient,
                latest.RequiredCoefficient,
                assembly.RequiredQuorumPercent,
                latest.Status == QuorumStatus.Reached,
                latest.PresentUnits,
                eligibleUnits,
                latest.TimestampUtc);
        }

        // Read-only recalculation (no snapshot write) when none exists yet.
        return await CalculateReadOnlyAsync(assembly, cancellationToken);
    }

    public async Task<IReadOnlyList<QuorumSnapshotDto>> ListSnapshotsAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        return await _db.QuorumSnapshots
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId)
            .OrderByDescending(s => s.TimestampUtc)
            .Select(s => new QuorumSnapshotDto(
                s.Id,
                s.AssemblyId,
                s.TimestampUtc,
                s.PresentUnits,
                s.PresentCoefficient,
                s.RequiredCoefficient,
                s.Status.ToString()))
            .ToListAsync(cancellationToken);
    }

    public async Task<QuorumStateDto> RecalculateAndSnapshotAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var calculation = await CalculateInternalAsync(assembly, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var snapshot = new QuorumSnapshot
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            TimestampUtc = now,
            PresentUnits = calculation.PresentUnits,
            PresentCoefficient = calculation.CurrentCoefficient,
            RequiredCoefficient = calculation.RequiredCoefficient,
            Status = calculation.QuorumReached ? QuorumStatus.Reached : QuorumStatus.NotReached
        };

        _db.QuorumSnapshots.Add(snapshot);
        await _db.SaveChangesAsync(cancellationToken);

        var state = Mapping.ToQuorumState(
            assemblyId,
            calculation.CurrentCoefficient,
            calculation.RequiredCoefficient,
            assembly.RequiredQuorumPercent,
            calculation.QuorumReached,
            calculation.PresentUnits,
            calculation.EligibleUnits,
            now);

        await _audit.WriteAsync(
            AuditEventType.QuorumChanged,
            assemblyId,
            metadata: new
            {
                state.CurrentCoefficient,
                state.RequiredCoefficient,
                state.QuorumReached,
                state.PresentUnits
            },
            cancellationToken: cancellationToken);

        await _realtime.PublishQuorumAsync(assemblyId, state, cancellationToken);

        return state;
    }

    private async Task<QuorumDto> CalculateReadOnlyAsync(
        Domain.Entities.Assembly assembly,
        CancellationToken cancellationToken)
    {
        var calculation = await CalculateInternalAsync(assembly, cancellationToken);
        return new QuorumDto(
            assembly.Id,
            calculation.CurrentCoefficient,
            calculation.RequiredCoefficient,
            assembly.RequiredQuorumPercent,
            calculation.QuorumReached,
            calculation.PresentUnits,
            calculation.EligibleUnits,
            DateTimeOffset.UtcNow);
    }

    private async Task<(decimal CurrentCoefficient, decimal RequiredCoefficient, bool QuorumReached, int PresentUnits, int EligibleUnits)> CalculateInternalAsync(
        Domain.Entities.Assembly assembly,
        CancellationToken cancellationToken)
    {
        var eligibleUnits = await _db.Units
            .AsNoTracking()
            .Where(u => u.TenantId == assembly.TenantId && u.PropertyHorizontalId == assembly.PropertyHorizontalId)
            .Select(u => new { u.Id, u.CoefficientPercent })
            .ToListAsync(cancellationToken);

        var presentUnitIds = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assembly.Id
                        && p.UnitId != null
                        && (p.AttendanceStatus == AttendanceStatus.CheckedIn
                            || p.AttendanceStatus == AttendanceStatus.Present
                            || p.AttendanceStatus == AttendanceStatus.TemporarilyDisconnected))
            .Select(p => p.UnitId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        var presentCoefficients = eligibleUnits
            .Where(u => presentUnitIds.Contains(u.Id))
            .Select(u => u.CoefficientPercent)
            .ToList();

        var calculation = QuorumEngine.Calculate(
            eligibleUnits.Select(u => u.CoefficientPercent),
            presentCoefficients,
            assembly.RequiredQuorumPercent);

        return (
            calculation.CurrentCoefficient,
            calculation.RequiredCoefficient,
            calculation.QuorumReached,
            calculation.PresentUnits,
            eligibleUnits.Count);
    }
}
