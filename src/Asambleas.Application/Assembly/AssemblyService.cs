namespace Asambleas.Application.Assembly;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Services;
using Microsoft.EntityFrameworkCore;

public sealed class AssemblyService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly Quorum.QuorumService _quorum;
    private readonly IScreenShareCoordinator _screenShare;
    private readonly Recording.RecordingService _recordings;

    public AssemblyService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime,
        Quorum.QuorumService quorum,
        IScreenShareCoordinator screenShare,
        Recording.RecordingService recordings)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
        _quorum = quorum;
        _screenShare = screenShare;
        _recordings = recordings;
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
        await EnsureAssemblyReadableAsync(assembly, cancellationToken);

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
        TransitionAsync(assemblyId, AssemblyStatus.Paused, AuditEventType.AssemblyPaused, cancellationToken);

    public Task<AssemblySummaryDto> ResumeAsync(Guid assemblyId, CancellationToken cancellationToken = default) =>
        TransitionAsync(assemblyId, AssemblyStatus.InProgress, AuditEventType.AssemblyResumed, cancellationToken);

    public Task<AssemblySummaryDto> CompleteAsync(Guid assemblyId, CancellationToken cancellationToken = default) =>
        TransitionAsync(assemblyId, AssemblyStatus.Completed, AuditEventType.AssemblyCompleted, cancellationToken);

    /// <summary>Draft → Scheduled (explicit publish / programar).</summary>
    public async Task<AssemblySummaryDto> PublishScheduledAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        AssemblyLifecycle.EnsureCanTransition(assembly.Status, AssemblyStatus.Scheduled);

        var from = assembly.Status;
        assembly.Status = AssemblyStatus.Scheduled;
        assembly.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var summary = Mapping.ToSummary(assembly);
        await _audit.WriteAsync(
            AuditEventType.AssemblyScheduled,
            assembly.Id,
            metadata: new { from = from.ToString(), to = AssemblyStatus.Scheduled.ToString(), action = "Publish" },
            cancellationToken: cancellationToken);
        await _realtime.PublishAssemblyStatusAsync(assembly.Id, summary, cancellationToken);
        return summary;
    }

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

            // Freeze quorum WHILE still operational (AssemblyEnd), then seal status.
            await _quorum.RecalculateAndSnapshotAsync(assemblyId, Quorum.QuorumService.AssemblyEndReason, cancellationToken);

            // Clear any active screen share so media/UI cannot linger past completion.
            var hadShare = _screenShare.TryGet(assemblyId) is { IsActive: true };
            _screenShare.Clear(assemblyId);
            if (hadShare)
            {
                await _realtime.PublishScreenShareUpdatedAsync(
                    assemblyId,
                    new Contracts.Meetings.ScreenShareStateDto(
                        assemblyId,
                        IsActive: false,
                        PresenterUserId: null,
                        PresenterDisplayName: null,
                        StartedAtUtc: null,
                        CurrentUserCanStart: false,
                        CurrentUserIsPresenter: false,
                        CurrentUserCanForceStop: false),
                    cancellationToken);
            }

            // Finalize in-flight recordings so Complete never leaves orphan Starting/Recording rows.
            await _recordings.FinalizeActiveRecordingsAsync(assemblyId, cancellationToken);
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

    private async Task EnsureAssemblyReadableAsync(Domain.Entities.Assembly assembly, CancellationToken cancellationToken)
    {
        if (_currentTenant.Permissions.Contains(Permissions.AssemblyManage)
            || _currentTenant.Permissions.Contains(Permissions.PhManage)
            || _currentTenant.Permissions.Contains(Permissions.AuditView))
        {
            return;
        }

        var userId = TenantGuard.RequireUserId(_currentTenant);
        var isParticipant = await _db.AssemblyParticipants.AsNoTracking().AnyAsync(
            p => p.AssemblyId == assembly.Id && p.UserId == userId,
            cancellationToken);
        if (isParticipant)
        {
            return;
        }

        var hasPhMembership = await _db.UserPropertyMemberships.AsNoTracking().AnyAsync(
            m => m.UserId == userId && m.PropertyHorizontalId == assembly.PropertyHorizontalId && m.IsActive,
            cancellationToken);
        if (hasPhMembership && _currentTenant.Permissions.Contains(Permissions.PhView))
        {
            return;
        }

        throw new DomainException("ASSEMBLY_ACCESS_DENIED", "No tienes acceso a esta asamblea.");
    }
}
