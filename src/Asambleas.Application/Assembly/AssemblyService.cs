namespace Asambleas.Application.Assembly;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Assemblies;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Services;
using Microsoft.EntityFrameworkCore;

public sealed class AssemblyService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;

    public AssemblyService(
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

    public async Task<IReadOnlyList<AssemblySummaryDto>> ListForCurrentUserAsync(
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var participantAssemblyIds = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Select(p => p.AssemblyId)
            .Distinct()
            .ToListAsync(cancellationToken);

        var assemblies = await _db.Assemblies
            .AsNoTracking()
            .Where(a => participantAssemblyIds.Contains(a.Id))
            .OrderByDescending(a => a.ScheduledAtUtc)
            .ToListAsync(cancellationToken);

        return assemblies.Select(Mapping.ToSummary).ToList();
    }

    public async Task<AssemblyDetailDto> GetAsync(Guid assemblyId, CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var phName = await _db.PropertyHorizontals
            .AsNoTracking()
            .Where(p => p.Id == assembly.PropertyHorizontalId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;

        return new AssemblyDetailDto(
            assembly.Id,
            assembly.TenantId,
            assembly.PropertyHorizontalId,
            phName,
            assembly.Title,
            assembly.Modality,
            assembly.Status.ToString(),
            assembly.ScheduledAtUtc,
            assembly.RequiredQuorumPercent,
            assembly.ActiveAgendaItemId,
            assembly.CreatedAtUtc,
            assembly.UpdatedAtUtc);
    }

    public Task<AssemblySummaryDto> StartCheckInAsync(Guid assemblyId, CancellationToken cancellationToken = default) =>
        TransitionAsync(assemblyId, AssemblyStatus.CheckIn, AuditEventType.AssemblyJoin, cancellationToken);

    public Task<AssemblySummaryDto> StartAsync(Guid assemblyId, CancellationToken cancellationToken = default) =>
        TransitionAsync(assemblyId, AssemblyStatus.InProgress, AuditEventType.AssemblyStarted, cancellationToken);

    public Task<AssemblySummaryDto> PauseAsync(Guid assemblyId, CancellationToken cancellationToken = default) =>
        TransitionAsync(assemblyId, AssemblyStatus.Paused, AuditEventType.AssemblyStarted, cancellationToken);

    public Task<AssemblySummaryDto> ResumeAsync(Guid assemblyId, CancellationToken cancellationToken = default) =>
        TransitionAsync(assemblyId, AssemblyStatus.InProgress, AuditEventType.AssemblyStarted, cancellationToken);

    public Task<AssemblySummaryDto> CompleteAsync(Guid assemblyId, CancellationToken cancellationToken = default) =>
        TransitionAsync(assemblyId, AssemblyStatus.Completed, AuditEventType.AssemblyCompleted, cancellationToken);

    private async Task<AssemblySummaryDto> TransitionAsync(
        Guid assemblyId,
        AssemblyStatus target,
        string auditEventType,
        CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var from = assembly.Status;
        AssemblyLifecycle.EnsureCanTransition(from, target);

        if (target == AssemblyStatus.Completed)
        {
            var openVoting = await _db.VotingSessions.AnyAsync(
                s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
                cancellationToken);
            if (openVoting)
            {
                throw new DomainException(
                    Domain.Voting.VotingCodes.OpenVotingExists,
                    "Cannot complete the assembly while a voting session is open.");
            }
        }

        assembly.Status = target;
        assembly.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);

        var summary = Mapping.ToSummary(assembly);

        await _audit.WriteAsync(
            auditEventType,
            assembly.Id,
            metadata: new { from = from.ToString(), to = target.ToString() },
            cancellationToken: cancellationToken);

        await _realtime.PublishAssemblyStatusAsync(assembly.Id, summary, cancellationToken);

        return summary;
    }
}
