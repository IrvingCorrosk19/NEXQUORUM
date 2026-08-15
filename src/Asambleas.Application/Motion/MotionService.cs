namespace Asambleas.Application.Motion;

using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Motions;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
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
            .OrderBy(m => m.DisplayOrder)
            .ThenBy(m => m.CreatedAtUtc)
            .ThenBy(m => m.Code)
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

    public async Task<MotionDto> CreateAsync(
        Guid assemblyId,
        CreateMotionRequest request,
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
            throw new DomainException("Cannot create motions on a closed assembly.");
        }

        await EnsureAgendaItemAsync(assemblyId, request.AgendaItemId, cancellationToken);

        var code = NormalizeRequired(request.Code, "Code", 64);
        var title = NormalizeRequired(request.Title, "Title", 512);
        var body = string.IsNullOrWhiteSpace(request.Body) ? title : request.Body.Trim();
        if (body.Length > 8000)
        {
            throw new DomainException("Body exceeds maximum length.");
        }

        var exists = await _db.Motions.AnyAsync(
            m => m.AssemblyId == assemblyId && m.Code == code,
            cancellationToken);
        if (exists)
        {
            throw new DomainException($"Motion code '{code}' already exists for this assembly.");
        }

        var design = NormalizeDesign(request);
        var nextOrder = await _db.Motions
            .Where(m => m.AssemblyId == assemblyId)
            .Select(m => (int?)m.DisplayOrder)
            .MaxAsync(cancellationToken) ?? 0;

        var motion = new MotionEntity
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            AgendaItemId = request.AgendaItemId,
            DisplayOrder = nextOrder + 1,
            Code = code,
            Title = title,
            Body = body,
            Status = MotionStatus.Draft,
            DesignStatus = design.DesignStatus,
            InstrumentKind = VotingDesignCodes.Instrument.FormalVote,
            BallotKind = design.BallotKind,
            CalculationMethod = design.CalculationMethod,
            DecisionRuleCode = design.DecisionRuleCode,
            RequiredThresholdPercent = design.RequiredThresholdPercent,
            DefaultResultVisibilityPolicy = design.Visibility,
            OptionsJson = design.OptionsJson,
            Instructions = Truncate(request.Instructions, 4000),
            QuestionText = Truncate(request.QuestionText ?? title, 2000),
            IsSecret = request.IsSecret,
            TemplateKey = Truncate(request.TemplateKey, 64)
        };

        _db.Motions.Add(motion);
        await _db.SaveChangesAsync(cancellationToken);

        var dto = ToDto(motion);
        await _audit.WriteAsync(
            AuditEventType.MotionCreated,
            assemblyId,
            metadata: new { motion.Id, motion.Code, motion.Title, motion.DecisionRuleCode, motion.RequiredThresholdPercent, motion.DisplayOrder },
            cancellationToken: cancellationToken);

        await _realtime.PublishMotionAsync(assemblyId, dto, cancellationToken);
        return dto;
    }

    public async Task<MotionDto> UpdateAsync(
        Guid assemblyId,
        Guid motionId,
        UpdateMotionRequest request,
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
            throw new DomainException("Cannot update motions on a closed assembly.");
        }

        var motion = await _db.Motions
            .FirstOrDefaultAsync(m => m.Id == motionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{motionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, motion.TenantId);
        await EnsureCriticalEditableAsync(motion, cancellationToken);

        if (request.ExpectedConcurrencyStamp is Guid expected
            && expected != Guid.Empty
            && expected != motion.ConcurrencyStamp)
        {
            throw new DomainException(
                "CONCURRENCY_CONFLICT",
                "Esta votación fue modificada por otro usuario. Recargue los cambios.");
        }

        var before = new
        {
            motion.Title,
            motion.QuestionText,
            motion.DecisionRuleCode,
            motion.RequiredThresholdPercent,
            motion.CalculationMethod,
            motion.OptionsJson,
            motion.DefaultResultVisibilityPolicy
        };

        if (request.AgendaItemId is Guid agendaId)
        {
            await EnsureAgendaItemAsync(assemblyId, agendaId, cancellationToken);
            motion.AgendaItemId = agendaId;
        }

        if (request.Code is not null)
        {
            var code = NormalizeRequired(request.Code, "Code", 64);
            var clash = await _db.Motions.AnyAsync(
                m => m.AssemblyId == assemblyId && m.Code == code && m.Id != motionId,
                cancellationToken);
            if (clash)
            {
                throw new DomainException($"Motion code '{code}' already exists for this assembly.");
            }

            motion.Code = code;
        }

        if (request.Title is not null)
        {
            motion.Title = NormalizeRequired(request.Title, "Title", 512);
        }

        if (request.Body is not null)
        {
            motion.Body = request.Body.Trim();
            if (motion.Body.Length > 8000)
            {
                throw new DomainException("Body exceeds maximum length.");
            }
        }

        ApplyDesignUpdates(motion, request);
        motion.ConcurrencyStamp = Guid.NewGuid();
        motion.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.VotingEdited,
            assemblyId,
            metadata: new
            {
                motion.Id,
                motion.Code,
                Before = before,
                After = new
                {
                    motion.Title,
                    motion.QuestionText,
                    motion.DecisionRuleCode,
                    motion.RequiredThresholdPercent,
                    motion.CalculationMethod,
                    motion.OptionsJson,
                    motion.DefaultResultVisibilityPolicy
                }
            },
            cancellationToken: cancellationToken);

        await _realtime.PublishMotionAsync(assemblyId, await ToDtoAsync(motion, cancellationToken), cancellationToken);
        return await ToDtoAsync(motion, cancellationToken);
    }

    public async Task<MotionEditPolicyDto> GetEditPolicyAsync(
        Guid assemblyId,
        Guid motionId,
        CancellationToken cancellationToken = default)
    {
        var motion = await GetEntityAsync(assemblyId, motionId, cancellationToken);
        var (mode, ballots, openId, message) = await ResolveEditStateAsync(motion, cancellationToken);
        return new MotionEditPolicyDto(
            motion.Id,
            mode,
            mode is "Full",
            ballots,
            openId,
            message,
            motion.ConcurrencyStamp);
    }

    public async Task<MotionDto> CreateVersionAsync(
        Guid assemblyId,
        Guid motionId,
        CreateMotionVersionRequest? request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var source = await GetEntityAsync(assemblyId, motionId, cancellationToken);

        if (source.Status is not MotionStatus.Cancelled)
        {
            throw new DomainException(
                "Solo se puede crear una nueva versión desde una moción anulada. Anule la votación abierta primero.");
        }

        var suffix = string.IsNullOrWhiteSpace(request?.CodeSuffix)
            ? $"v{source.VersionNumber + 1}"
            : request!.CodeSuffix!.Trim();
        var code = Truncate($"{source.Code}-{suffix}", 64)!;
        var exists = await _db.Motions.AnyAsync(m => m.AssemblyId == assemblyId && m.Code == code, cancellationToken);
        if (exists)
        {
            code = Truncate($"{source.Code}-{DateTimeOffset.UtcNow:HHmmss}", 64)!;
        }

        var version = new MotionEntity
        {
            TenantId = source.TenantId,
            AssemblyId = assemblyId,
            AgendaItemId = source.AgendaItemId,
            DisplayOrder = source.DisplayOrder,
            Code = code!,
            Title = source.Title,
            Body = source.Body,
            Status = MotionStatus.Draft,
            DesignStatus = VotingDesignCodes.DesignStatus.Draft,
            InstrumentKind = source.InstrumentKind,
            BallotKind = source.BallotKind,
            CalculationMethod = source.CalculationMethod,
            DecisionRuleCode = source.DecisionRuleCode,
            RequiredThresholdPercent = source.RequiredThresholdPercent,
            DefaultResultVisibilityPolicy = source.DefaultResultVisibilityPolicy,
            OptionsJson = source.OptionsJson,
            Instructions = source.Instructions,
            QuestionText = source.QuestionText,
            IsSecret = source.IsSecret,
            TemplateKey = source.TemplateKey,
            RootMotionId = source.RootMotionId ?? source.Id,
            PreviousMotionId = source.Id,
            VersionNumber = source.VersionNumber + 1,
            ConcurrencyStamp = Guid.NewGuid()
        };

        _db.Motions.Add(version);
        await _db.SaveChangesAsync(cancellationToken);

        var dto = await ToDtoAsync(version, cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.VotingVersionCreated,
            assemblyId,
            metadata: new
            {
                PreviousMotionId = source.Id,
                NewMotionId = version.Id,
                version.VersionNumber,
                version.Code
            },
            cancellationToken: cancellationToken);

        await _realtime.PublishVotingVersionCreatedAsync(assemblyId, dto, cancellationToken);
        await _realtime.PublishMotionAsync(assemblyId, dto, cancellationToken);
        return dto;
    }

    public async Task<MotionDto> PublishAsync(
        Guid assemblyId,
        Guid motionId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var motion = await LoadEditableAsync(assemblyId, motionId, cancellationToken);
        ValidateForPublish(motion);

        motion.DesignStatus = VotingDesignCodes.DesignStatus.Ready;
        motion.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.MotionPublished,
            assemblyId,
            metadata: new { motion.Id, motion.Code },
            cancellationToken: cancellationToken);

        return ToDto(motion);
    }

    public async Task<MotionDto> DuplicateAsync(
        Guid assemblyId,
        Guid motionId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var source = await _db.Motions
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == motionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{motionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, source.TenantId);

        var suffix = DateTimeOffset.UtcNow.ToString("HHmmss");
        var code = Truncate($"{source.Code}-{suffix}", 64)!;

        return await CreateAsync(
            assemblyId,
            new CreateMotionRequest(
                source.AgendaItemId,
                code!,
                $"{source.Title} (copia)",
                source.Body,
                VotingDesignCodes.DesignStatus.Draft,
                source.InstrumentKind,
                source.BallotKind,
                source.CalculationMethod,
                source.DecisionRuleCode,
                source.RequiredThresholdPercent,
                source.DefaultResultVisibilityPolicy,
                source.OptionsJson,
                source.Instructions,
                source.QuestionText,
                source.IsSecret,
                source.TemplateKey),
            cancellationToken);
    }

    public async Task<MotionDto> ArchiveAsync(
        Guid assemblyId,
        Guid motionId,
        CancellationToken cancellationToken = default)
    {
        var motion = await LoadEditableAsync(assemblyId, motionId, cancellationToken);
        if (motion.Status is MotionStatus.Voting)
        {
            throw new DomainException("Cannot archive a motion while voting is open.");
        }

        var sessionIds = await _db.VotingSessions
            .AsNoTracking()
            .Where(s => s.MotionId == motion.Id)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);
        var ballots = sessionIds.Count == 0
            ? 0
            : await _db.Votes.CountAsync(v => sessionIds.Contains(v.VotingSessionId), cancellationToken);
        if (ballots > 0 || motion.Status is MotionStatus.Approved or MotionStatus.Rejected or MotionStatus.Cancelled)
        {
            throw new DomainException(
                "MOTION_HAS_HISTORY",
                "No se puede eliminar una pregunta con votos o resultado. Anule la votación y cree una nueva versión.");
        }

        motion.DesignStatus = VotingDesignCodes.DesignStatus.Archived;
        motion.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        var dto = ToDto(motion);
        await _audit.WriteAsync(
            AuditEventType.MotionArchived,
            assemblyId,
            metadata: new { motion.Id, motion.Code, PreviousState = motion.Status.ToString() },
            cancellationToken: cancellationToken);
        await _realtime.PublishMotionAsync(assemblyId, dto, cancellationToken);
        return dto;
    }

    public async Task<IReadOnlyList<MotionDto>> ReorderAsync(
        Guid assemblyId,
        ReorderMotionsRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        ArgumentNullException.ThrowIfNull(request);

        if (request.OrderedMotionIds is null || request.OrderedMotionIds.Count == 0)
        {
            throw new DomainException("OrderedMotionIds is required.");
        }

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException("Cannot reorder motions on a closed assembly.");
        }

        var motions = await _db.Motions
            .Where(m => m.AssemblyId == assemblyId && m.DesignStatus != VotingDesignCodes.DesignStatus.Archived)
            .ToListAsync(cancellationToken);

        var byId = motions.ToDictionary(m => m.Id);
        if (request.OrderedMotionIds.Any(id => !byId.ContainsKey(id)))
        {
            throw new DomainException("One or more motions were not found for this assembly.");
        }

        if (request.OrderedMotionIds.Count != motions.Count
            || request.OrderedMotionIds.Distinct().Count() != request.OrderedMotionIds.Count)
        {
            throw new DomainException("Reorder must include each active motion exactly once.");
        }

        for (var i = 0; i < request.OrderedMotionIds.Count; i++)
        {
            var motion = byId[request.OrderedMotionIds[i]];
            motion.DisplayOrder = i + 1;
            motion.UpdatedAtUtc = DateTimeOffset.UtcNow;
            motion.ConcurrencyStamp = Guid.NewGuid();
        }

        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.MotionReordered,
            assemblyId,
            metadata: new { OrderedMotionIds = request.OrderedMotionIds },
            cancellationToken: cancellationToken);

        var ordered = await ListAsync(assemblyId, cancellationToken);
        if (ordered.Count > 0)
        {
            await _realtime.PublishMotionAsync(assemblyId, ordered[0], cancellationToken);
        }

        return ordered;
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

        if (motion.DesignStatus == VotingDesignCodes.DesignStatus.Archived)
        {
            throw new DomainException("Archived motions cannot be presented.");
        }

        if (motion.Status is MotionStatus.Cancelled)
        {
            throw new DomainException("Cancelled motions cannot be presented. Create a new version first.");
        }

        if (motion.Status is not (MotionStatus.Draft or MotionStatus.Presented))
        {
            throw new DomainException($"Motion cannot be presented from status '{motion.Status}'.");
        }

        ValidateForPublish(motion);

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
        motion.DesignStatus = VotingDesignCodes.DesignStatus.Ready;
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

    private async Task<MotionEntity> LoadEditableAsync(
        Guid assemblyId,
        Guid motionId,
        CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var motion = await _db.Motions
            .FirstOrDefaultAsync(m => m.Id == motionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{motionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, motion.TenantId);
        await EnsureCriticalEditableAsync(motion, cancellationToken);
        return motion;
    }

    private async Task<MotionEntity> GetEntityAsync(
        Guid assemblyId,
        Guid motionId,
        CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var motion = await _db.Motions
            .FirstOrDefaultAsync(m => m.Id == motionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{motionId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, motion.TenantId);
        return motion;
    }

    private async Task EnsureCriticalEditableAsync(MotionEntity motion, CancellationToken cancellationToken)
    {
        if (motion.DesignStatus == VotingDesignCodes.DesignStatus.Archived)
        {
            throw new DomainException("Archived motions cannot be edited.");
        }

        if (motion.Status is MotionStatus.Approved or MotionStatus.Rejected or MotionStatus.Cancelled)
        {
            throw new DomainException(
                "VOTING_IMMUTABLE",
                "Esta votación es histórica e inmutable. Anule y cree una nueva versión si necesita corregir.");
        }

        if (motion.Status == MotionStatus.Voting)
        {
            var (mode, ballots, _, _) = await ResolveEditStateAsync(motion, cancellationToken);
            if (ballots > 0)
            {
                throw new DomainException(
                    "VOTING_LOCKED",
                    "No se pudo guardar porque ya se registró el primer voto. Anule y cree una nueva versión.");
            }

            throw new DomainException(
                "VOTING_OPEN_ZERO",
                "La votación está abierta. Retire la apertura (sin votos) antes de editar campos críticos.");
        }
    }

    private async Task<(string Mode, int Ballots, Guid? OpenId, string? Message)> ResolveEditStateAsync(
        MotionEntity motion,
        CancellationToken cancellationToken)
    {
        if (motion.Status is MotionStatus.Approved or MotionStatus.Rejected or MotionStatus.Cancelled)
        {
            return ("Immutable", 0, null, "Registro histórico inmutable.");
        }

        var open = await _db.VotingSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(
                s => s.MotionId == motion.Id && s.Status == VotingSessionStatus.Open,
                cancellationToken);

        if (open is null)
        {
            if (motion.Status is MotionStatus.Draft or MotionStatus.Presented)
            {
                return ("Full", 0, null, null);
            }

            return ("Immutable", 0, null, null);
        }

        var ballots = await _db.Votes.CountAsync(v => v.VotingSessionId == open.Id, cancellationToken);
        if (ballots == 0)
        {
            return (
                "WithdrawRequired",
                0,
                open.Id,
                "La votación está abierta sin votos. Retire la apertura para editar.");
        }

        return (
            "CancelRequired",
            ballots,
            open.Id,
            $"Esta votación ya recibió {ballots} votos. Anule y cree una nueva versión para corregir.");
    }

    private async Task EnsureAgendaItemAsync(Guid assemblyId, Guid agendaItemId, CancellationToken cancellationToken)
    {
        var item = await _db.AgendaItems
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == agendaItemId && i.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Agenda item '{agendaItemId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, item.TenantId);
    }

    private static void ValidateForPublish(MotionEntity motion)
    {
        if (string.IsNullOrWhiteSpace(motion.Title) || string.IsNullOrWhiteSpace(motion.Code))
        {
            throw new DomainException("Title and code are required to publish.");
        }

        if (motion.DecisionRuleCode == QualifiedMajorityDecisionRule.Code
            && motion.RequiredThresholdPercent is null or <= 0 or > 100)
        {
            throw new DomainException("Qualified majority requires a threshold between 0 and 100.");
        }

        if (motion.BallotKind is VotingDesignCodes.Ballot.SingleChoice or VotingDesignCodes.Ballot.MultiCandidate)
        {
            var options = ParseOptions(motion.OptionsJson);
            if (options.Count < 2)
            {
                throw new DomainException("Single/multi candidate ballots require at least two options.");
            }

            if (options.Distinct(StringComparer.OrdinalIgnoreCase).Count() != options.Count)
            {
                throw new DomainException("Duplicate options are not allowed.");
            }
        }
    }

    private static List<string> ParseOptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json)?
                       .Where(s => !string.IsNullOrWhiteSpace(s))
                       .Select(s => s.Trim())
                       .ToList()
                   ?? [];
        }
        catch (JsonException)
        {
            throw new DomainException("OptionsJson must be a JSON array of strings.");
        }
    }

    private static DesignNormalized NormalizeDesign(CreateMotionRequest request)
    {
        var ballot = NormalizeEnum(
            request.BallotKind,
            VotingDesignCodes.Ballot.FavorAgainstAbstain,
            VotingDesignCodes.Ballot.FavorAgainstAbstain,
            VotingDesignCodes.Ballot.YesNo,
            VotingDesignCodes.Ballot.YesNoAbstain,
            VotingDesignCodes.Ballot.SingleChoice,
            VotingDesignCodes.Ballot.MultiCandidate);

        var calc = NormalizeEnum(
            request.CalculationMethod,
            VotingDesignCodes.Calculation.Coefficient,
            VotingDesignCodes.Calculation.Coefficient,
            VotingDesignCodes.Calculation.PerPerson,
            VotingDesignCodes.Calculation.PerUnit);

        var rule = NormalizeEnum(
            request.DecisionRuleCode,
            SimpleMajorityDecisionRule.Code,
            SimpleMajorityDecisionRule.Code,
            QualifiedMajorityDecisionRule.Code);

        decimal? threshold = request.RequiredThresholdPercent;
        if (rule == QualifiedMajorityDecisionRule.Code)
        {
            threshold ??= 66.67m;
            threshold = Math.Round(threshold.Value, 4, MidpointRounding.AwayFromZero);
        }
        else
        {
            threshold = null;
        }

        var visibility = NormalizeEnum(
            request.DefaultResultVisibilityPolicy,
            ResultVisibility.HiddenUntilClose,
            ResultVisibility.HiddenUntilClose,
            ResultVisibility.PresidentOnlyLive,
            ResultVisibility.LiveResults);

        var designStatus = NormalizeEnum(
            request.DesignStatus,
            VotingDesignCodes.DesignStatus.Draft,
            VotingDesignCodes.DesignStatus.Draft,
            VotingDesignCodes.DesignStatus.Ready);

        string? optionsJson = request.OptionsJson;
        if (!string.IsNullOrWhiteSpace(optionsJson))
        {
            _ = ParseOptions(optionsJson);
        }

        return new DesignNormalized(designStatus, ballot, calc, rule, threshold, visibility, optionsJson);
    }

    private static void ApplyDesignUpdates(MotionEntity motion, UpdateMotionRequest request)
    {
        if (request.BallotKind is not null)
        {
            motion.BallotKind = NormalizeEnum(
                request.BallotKind,
                motion.BallotKind,
                VotingDesignCodes.Ballot.FavorAgainstAbstain,
                VotingDesignCodes.Ballot.YesNo,
                VotingDesignCodes.Ballot.YesNoAbstain,
                VotingDesignCodes.Ballot.SingleChoice,
                VotingDesignCodes.Ballot.MultiCandidate);
        }

        if (request.CalculationMethod is not null)
        {
            motion.CalculationMethod = NormalizeEnum(
                request.CalculationMethod,
                motion.CalculationMethod,
                VotingDesignCodes.Calculation.Coefficient,
                VotingDesignCodes.Calculation.PerPerson,
                VotingDesignCodes.Calculation.PerUnit);
        }

        if (request.DecisionRuleCode is not null)
        {
            motion.DecisionRuleCode = NormalizeEnum(
                request.DecisionRuleCode,
                motion.DecisionRuleCode,
                SimpleMajorityDecisionRule.Code,
                QualifiedMajorityDecisionRule.Code);
        }

        if (request.RequiredThresholdPercent.HasValue || request.DecisionRuleCode is not null)
        {
            if (motion.DecisionRuleCode == QualifiedMajorityDecisionRule.Code)
            {
                var t = request.RequiredThresholdPercent ?? motion.RequiredThresholdPercent ?? 66.67m;
                motion.RequiredThresholdPercent = Math.Round(t, 4, MidpointRounding.AwayFromZero);
            }
            else
            {
                motion.RequiredThresholdPercent = null;
            }
        }

        if (request.DefaultResultVisibilityPolicy is not null)
        {
            motion.DefaultResultVisibilityPolicy = NormalizeEnum(
                request.DefaultResultVisibilityPolicy,
                motion.DefaultResultVisibilityPolicy,
                ResultVisibility.HiddenUntilClose,
                ResultVisibility.PresidentOnlyLive,
                ResultVisibility.LiveResults);
        }

        if (request.OptionsJson is not null)
        {
            _ = ParseOptions(request.OptionsJson);
            motion.OptionsJson = request.OptionsJson;
        }

        if (request.Instructions is not null)
        {
            motion.Instructions = Truncate(request.Instructions, 4000);
        }

        if (request.QuestionText is not null)
        {
            motion.QuestionText = Truncate(request.QuestionText, 2000);
        }

        if (request.IsSecret.HasValue)
        {
            motion.IsSecret = request.IsSecret.Value;
        }

        if (request.TemplateKey is not null)
        {
            motion.TemplateKey = Truncate(request.TemplateKey, 64);
        }
    }

    private static string NormalizeEnum(string? value, string fallback, params string[] allowed)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        var match = allowed.FirstOrDefault(a => a.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase));
        return match ?? throw new DomainException($"Unsupported value '{value}'.");
    }

    private static string NormalizeRequired(string? value, string field, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new DomainException($"{field} is required.");
        }

        var trimmed = value.Trim();
        if (trimmed.Length > max)
        {
            throw new DomainException($"{field} exceeds maximum length.");
        }

        return trimmed;
    }

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    private async Task<MotionDto> ToDtoAsync(MotionEntity motion, CancellationToken cancellationToken)
    {
        var (mode, ballots, _, message) = await ResolveEditStateAsync(motion, cancellationToken);
        return new(
            motion.Id,
            motion.AssemblyId,
            motion.AgendaItemId,
            motion.Code,
            motion.Title,
            motion.Body,
            motion.Status.ToString(),
            motion.DesignStatus,
            motion.InstrumentKind,
            motion.BallotKind,
            motion.CalculationMethod,
            motion.DecisionRuleCode,
            motion.RequiredThresholdPercent,
            motion.DefaultResultVisibilityPolicy,
            motion.OptionsJson,
            motion.Instructions,
            motion.QuestionText,
            motion.IsSecret,
            motion.TemplateKey,
            motion.VersionNumber,
            motion.RootMotionId,
            motion.PreviousMotionId,
            motion.ConcurrencyStamp,
            mode,
            ballots,
            message,
            motion.DisplayOrder);
    }

    private MotionDto ToDto(MotionEntity motion) =>
        new(
            motion.Id,
            motion.AssemblyId,
            motion.AgendaItemId,
            motion.Code,
            motion.Title,
            motion.Body,
            motion.Status.ToString(),
            motion.DesignStatus,
            motion.InstrumentKind,
            motion.BallotKind,
            motion.CalculationMethod,
            motion.DecisionRuleCode,
            motion.RequiredThresholdPercent,
            motion.DefaultResultVisibilityPolicy,
            motion.OptionsJson,
            motion.Instructions,
            motion.QuestionText,
            motion.IsSecret,
            motion.TemplateKey,
            motion.VersionNumber,
            motion.RootMotionId,
            motion.PreviousMotionId,
            motion.ConcurrencyStamp,
            DisplayOrder: motion.DisplayOrder);

    private sealed record DesignNormalized(
        string DesignStatus,
        string BallotKind,
        string CalculationMethod,
        string DecisionRuleCode,
        decimal? RequiredThresholdPercent,
        string Visibility,
        string? OptionsJson);
}
