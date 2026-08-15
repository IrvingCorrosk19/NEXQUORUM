namespace Asambleas.Application.Voting;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Quorum;
using Asambleas.Contracts.Voting;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using System.Text.Json;

public sealed class VotingService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly DecisionRuleResolver _decisionRules;
    private readonly IAssemblyRepresentationService _representation;
    private readonly QuorumService _quorum;

    public VotingService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime,
        DecisionRuleResolver decisionRules,
        IAssemblyRepresentationService representation,
        QuorumService quorum)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
        _decisionRules = decisionRules;
        _representation = representation;
        _quorum = quorum;
    }

    public async Task<VotingSessionDto> OpenSessionAsync(
        Guid assemblyId,
        OpenVotingSessionRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var openedBy = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status != AssemblyStatus.InProgress)
        {
            throw new DomainException(
                VotingCodes.AssemblyNotActive,
                "Voting can only be opened while the assembly is in progress.");
        }

        var motion = await _db.Motions
            .FirstOrDefaultAsync(m => m.Id == request.MotionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{request.MotionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, motion.TenantId);

        if (motion.Status is not MotionStatus.Presented)
        {
            throw new DomainException(
                VotingCodes.MotionInvalid,
                "Voting can only be opened for a presented motion.");
        }

        if (motion.InstrumentKind == VotingDesignCodes.Instrument.Survey)
        {
            throw new DomainException(
                VotingCodes.MotionInvalid,
                "Survey instruments cannot open formal voting. Use the Forms Studio survey flow.");
        }

        var openExists = await _db.VotingSessions.AnyAsync(
            s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
            cancellationToken);

        if (openExists)
        {
            throw new DomainException(
                VotingCodes.OpenVotingExists,
                "Another voting session is already open for this assembly.");
        }

        var policy = ResolvePolicy(request, motion.DefaultResultVisibilityPolicy);
        var calcMethod = string.IsNullOrWhiteSpace(motion.CalculationMethod)
            ? VotingDesignCodes.Calculation.Coefficient
            : motion.CalculationMethod;
        var eligibility = await BuildEligibilityAsync(assemblyId, calcMethod, cancellationToken);
        if (eligibility.Count == 0)
        {
            throw new DomainException(
                VotingCodes.NotEligible,
                "Cannot open voting: no accredited eligible voters.");
        }

        var ruleCode = string.IsNullOrWhiteSpace(motion.DecisionRuleCode)
            ? SimpleMajorityDecisionRule.Code
            : motion.DecisionRuleCode;
        _ = _decisionRules.Resolve(ruleCode); // validate known rule

        var now = DateTimeOffset.UtcNow;
        var snapshotJson = JsonSerializer.Serialize(new
        {
            motion.Code,
            motion.Title,
            Question = motion.QuestionText ?? motion.Title,
            motion.Body,
            motion.BallotKind,
            CalculationMethod = calcMethod,
            DecisionRuleCode = ruleCode,
            motion.RequiredThresholdPercent,
            ResultVisibilityPolicy = ResultVisibility.ToWire(policy),
            motion.OptionsJson,
            motion.IsSecret,
            motion.Instructions,
            EligibilityBasis = "AccreditedParticipants",
            CoefficientBasis = calcMethod
        });

        var session = new VotingSession
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            MotionId = motion.Id,
            Status = VotingSessionStatus.Open,
            OpenedAtUtc = now,
            OpenedByUserId = openedBy,
            ResultVisibilityPolicy = ResultVisibility.ToWire(policy),
            HidePartialResults = ResultVisibility.HidesPublicTrend(policy),
            EligibleVoters = eligibility.Count,
            EligibleCoefficient = Math.Round(
                eligibility.Sum(e => e.CoefficientPercent),
                4,
                MidpointRounding.AwayFromZero),
            AppliedDecisionRule = ruleCode,
            RequiredThresholdPercent = motion.RequiredThresholdPercent,
            CalculationMethod = calcMethod,
            BallotKind = motion.BallotKind,
            RuleSnapshotJson = snapshotJson,
            VersionNumber = motion.VersionNumber <= 0 ? 1 : motion.VersionNumber,
            RootVotingSessionId = null, // set after save to self or previous root
            PreviousVotingSessionId = null,
            ConcurrencyStamp = Guid.NewGuid()
        };

        var previousCancelled = await _db.VotingSessions
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId
                        && s.Status == VotingSessionStatus.Cancelled
                        && (s.MotionId == motion.PreviousMotionId || s.MotionId == motion.Id))
            .OrderByDescending(s => s.CancelledAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (previousCancelled is not null)
        {
            session.PreviousVotingSessionId = previousCancelled.Id;
            session.RootVotingSessionId = previousCancelled.RootVotingSessionId ?? previousCancelled.Id;
            session.VersionNumber = Math.Max(motion.VersionNumber, previousCancelled.VersionNumber + 1);
        }

        motion.Status = MotionStatus.Voting;
        motion.UpdatedAtUtc = now;

        _db.VotingSessions.Add(session);

        foreach (var row in eligibility)
        {
            _db.VotingEligibilitySnapshots.Add(new VotingEligibilitySnapshot
            {
                TenantId = assembly.TenantId,
                AssemblyId = assemblyId,
                VotingSessionId = session.Id,
                UserId = row.UserId,
                UnitId = row.UnitId,
                CoefficientPercent = row.CoefficientPercent,
                UnitCode = row.UnitCode
            });
        }

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            throw new DomainException(
                VotingCodes.OpenVotingExists,
                "Another voting session is already open for this assembly.",
                ex);
        }

        if (session.RootVotingSessionId is null)
        {
            session.RootVotingSessionId = session.Id;
            await _db.SaveChangesAsync(cancellationToken);
        }

        await _quorum.RecalculateAndSnapshotAsync(assemblyId, "VotingOpen", cancellationToken);

        var dto = await ToSessionDtoAsync(session, cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.VotingOpened,
            assemblyId,
            metadata: new
            {
                VotingSessionId = session.Id,
                MotionId = motion.Id,
                session.HidePartialResults,
                session.ResultVisibilityPolicy,
                session.EligibleVoters,
                session.EligibleCoefficient,
                OpenedByUserId = openedBy,
                AppliedDecisionRule = session.AppliedDecisionRule
            },
            cancellationToken: cancellationToken);

        await _realtime.PublishVotingOpenedAsync(assemblyId, dto, cancellationToken);
        await _realtime.PublishMotionAsync(
            assemblyId,
            new Contracts.Motions.MotionDto(
                motion.Id,
                motion.AssemblyId,
                motion.AgendaItemId,
                motion.Code,
                motion.Title,
                motion.Body,
                motion.Status.ToString()),
            cancellationToken);

        // Initial participation pulse (trend per policy — usually hidden).
        await PublishParticipationPulseAsync(session, cancellationToken);

        return dto;
    }

    public async Task<CastVoteResponse> CastVoteAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CastVoteRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var clientRequestId = NormalizeClientRequestId(request.ClientRequestId);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException(
                VotingCodes.AssemblyClosed,
                "Votes cannot be cast after the assembly is closed.");
        }

        await using var tx = await BeginExclusiveVotingSessionAsync(votingSessionId, cancellationToken);

        var session = await _db.VotingSessions
            .FirstOrDefaultAsync(s => s.Id == votingSessionId && s.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException(
                VotingCodes.SessionNotFound,
                $"Voting session '{votingSessionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);

        if (session.Status != VotingSessionStatus.Open)
        {
            throw new DomainException(
                VotingCodes.VotingClosed,
                "Votes can only be cast while the voting session is open.");
        }

        // Idempotent replay by client request id (before participant checks for speed).
        if (clientRequestId is not null)
        {
            var byKey = await _db.Votes
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    v => v.VotingSessionId == votingSessionId && v.ClientRequestId == clientRequestId,
                    cancellationToken);
            if (byKey is not null)
            {
                if (byKey.UserId != userId)
                {
                    throw new DomainException(
                        VotingCodes.NotEligible,
                        "Client request id is already bound to another voter.");
                }

                await tx.CommitAsync(cancellationToken);
                return ToCastResponse(byKey, idempotentReplay: true);
            }
        }

        var participant = await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException(
                VotingCodes.NotParticipant,
                "Participant is not registered for this assembly.");

        TenantGuard.EnsureTenantMatch(_currentTenant, participant.TenantId);

        if (participant.AttendanceStatus is AttendanceStatus.Registered or AttendanceStatus.Left
            || !participant.IsAccredited)
        {
            throw new DomainException(
                VotingCodes.NotAccredited,
                "Participant is not accredited and eligible to vote.");
        }

        // Prefer frozen eligibility snapshot when present.
        var snapshot = await _db.VotingEligibilitySnapshots
            .AsNoTracking()
            .FirstOrDefaultAsync(
                e => e.VotingSessionId == votingSessionId && e.UserId == userId,
                cancellationToken);

        if (session.EligibleVoters > 0 && snapshot is null)
        {
            throw new DomainException(
                VotingCodes.NotEligible,
                "Participant was not eligible when this voting session opened.");
        }

        if (!Enum.TryParse<VoteChoice>(request.Choice, ignoreCase: true, out var choice))
        {
            // Accept common UI alias without inventing a separate legal meaning.
            if (string.Equals(request.Choice, "Abstain", StringComparison.OrdinalIgnoreCase))
            {
                choice = VoteChoice.Abstention;
            }
            else
            {
                throw new DomainException(
                    VotingCodes.InvalidChoice,
                    $"Unknown vote choice '{request.Choice}'.");
            }
        }

        var existing = await _db.Votes
            .AsNoTracking()
            .FirstOrDefaultAsync(
                v => v.VotingSessionId == votingSessionId && v.UserId == userId,
                cancellationToken);

        if (existing is not null)
        {
            if (existing.Choice == choice)
            {
                await tx.CommitAsync(cancellationToken);
                return ToCastResponse(existing, idempotentReplay: true);
            }

            throw new DomainException(
                VotingCodes.AlreadyVoted,
                "Double vote is not allowed for this voting session.");
        }

        // Coefficient: prefer snapshot; else representation authority — never trust client.
        decimal coefficient;
        Guid? unitId;

        if (snapshot is not null)
        {
            coefficient = snapshot.CoefficientPercent;
            unitId = snapshot.UnitId;
            if (request.UnitId is Guid requested
                && snapshot.UnitId is Guid snapUnit
                && requested != snapUnit)
            {
                // Ignore foreign unitId from client when snapshot exists.
                unitId = snapUnit;
            }
        }
        else
        {
            var representations = await _representation.GetActiveForUserAsync(assemblyId, userId, cancellationToken);
            if (representations.Count > 0)
            {
                coefficient = Math.Round(
                    representations.Sum(r => r.CoefficientPercent),
                    4,
                    MidpointRounding.AwayFromZero);
                if (request.UnitId is Guid requested
                    && representations.Any(r => r.UnitId == requested))
                {
                    unitId = requested;
                }
                else
                {
                    unitId = representations[0].UnitId;
                }
            }
            else
            {
                coefficient = participant.EffectiveCoefficientPercent;
                unitId = participant.UnitId;
                if (request.UnitId is Guid requestedUnit
                    && requestedUnit != participant.UnitId)
                {
                    throw new DomainException(
                        VotingCodes.NotEligible,
                        "Vote unit must match an accredited representation.");
                }
            }
        }

        var evidenceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        var vote = new Vote
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            VotingSessionId = votingSessionId,
            UserId = userId,
            UnitId = unitId,
            Choice = choice,
            CoefficientPercent = coefficient,
            EvidenceId = evidenceId,
            CastAtUtc = now,
            ClientRequestId = clientRequestId
        };

        _db.Votes.Add(vote);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            await tx.RollbackAsync(cancellationToken);
            var winner = await _db.Votes
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    v => v.VotingSessionId == votingSessionId && v.UserId == userId,
                    cancellationToken);

            if (winner is null && clientRequestId is not null)
            {
                winner = await _db.Votes
                    .AsNoTracking()
                    .FirstOrDefaultAsync(
                        v => v.VotingSessionId == votingSessionId && v.ClientRequestId == clientRequestId,
                        cancellationToken);
            }

            if (winner is null)
            {
                throw new DomainException(
                    VotingCodes.AlreadyVoted,
                    "Double vote is not allowed for this voting session.",
                    ex);
            }

            if (winner.Choice != choice)
            {
                throw new DomainException(
                    VotingCodes.ConflictChoice,
                    "Double vote is not allowed for this voting session.",
                    ex);
            }

            return ToCastResponse(winner, idempotentReplay: true);
        }

        var policy = ResultVisibility.Parse(session.ResultVisibilityPolicy, session.HidePartialResults);

        await _audit.WriteAsync(
            AuditEventType.VoteCast,
            assemblyId,
            metadata: new
            {
                votingSessionId,
                vote.Id,
                evidenceId,
                clientRequestId,
                // Choice intentionally omitted (secret-safe audit).
                ResultVisibilityPolicy = ResultVisibility.ToWire(policy)
            },
            cancellationToken: cancellationToken);

        var priorCount = await _db.Votes.CountAsync(
            v => v.VotingSessionId == votingSessionId && v.Id != vote.Id,
            cancellationToken);
        if (priorCount == 0)
        {
            await _audit.WriteAsync(
                AuditEventType.FirstBallotAccepted,
                assemblyId,
                metadata: new { votingSessionId, vote.Id },
                cancellationToken: cancellationToken);
            await _audit.WriteAsync(
                AuditEventType.VotingLocked,
                assemblyId,
                metadata: new { votingSessionId, Reason = "First accepted ballot" },
                cancellationToken: cancellationToken);
        }

        await PublishParticipationPulseAsync(session, cancellationToken);

        return ToCastResponse(vote, idempotentReplay: false);
    }

    public async Task<VotingSessionDto> WithdrawOpenAsync(
        Guid assemblyId,
        Guid votingSessionId,
        WithdrawOpenVotingRequest? request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var session = await LoadOpenSessionForMutationAsync(assemblyId, votingSessionId, cancellationToken);
        EnsureConcurrency(session, request?.ExpectedConcurrencyStamp);

        // Atomic: lock by re-counting inside same tracked unit of work.
        var ballots = await _db.Votes.CountAsync(v => v.VotingSessionId == session.Id, cancellationToken);
        if (ballots > 0)
        {
            throw new DomainException(
                "VOTING_LOCKED",
                "No se pudo retirar la apertura porque ya se registró el primer voto.");
        }

        var motion = await _db.Motions
            .FirstOrDefaultAsync(m => m.Id == session.MotionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{session.MotionId}' was not found.");

        var now = DateTimeOffset.UtcNow;
        session.Status = VotingSessionStatus.Cancelled;
        session.CancellationReason = "Corrección antes de recibir votos";
        session.CancelledAtUtc = now;
        session.CancelledByUserId = userId;
        session.ConcurrencyStamp = Guid.NewGuid();
        session.UpdatedAtUtc = now;

        motion.Status = MotionStatus.Presented;
        motion.ConcurrencyStamp = Guid.NewGuid();
        motion.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);

        // Re-check race: if a vote snuck in, we still cancelled — but votes exist on cancelled session (evidence).
        // For withdraw we required 0 at check; concurrent insert would violate only if SaveOrder differs.
        // Extra safety: if votes appeared, convert message to locked for clients polling.
        var after = await _db.Votes.CountAsync(v => v.VotingSessionId == session.Id, cancellationToken);
        if (after > 0)
        {
            // Keep cancelled (votes preserved); motion stays Presented for versioning path via Cancel API next time.
            motion.Status = MotionStatus.Cancelled;
            await _db.SaveChangesAsync(cancellationToken);
            throw new DomainException(
                "VOTING_LOCKED",
                "Un voto llegó durante la retirada. La sesión quedó anulada con evidencia; cree una nueva versión.");
        }

        var dto = await ToSessionDtoAsync(session, cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.VotingWithdrawn,
            assemblyId,
            metadata: new { VotingSessionId = session.Id, MotionId = motion.Id },
            cancellationToken: cancellationToken);
        await _realtime.PublishVotingCancelledAsync(assemblyId, dto, cancellationToken);
        await _realtime.PublishMotionAsync(
            assemblyId,
            new Contracts.Motions.MotionDto(
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
                "Full"),
            cancellationToken);

        return dto;
    }

    public async Task<VotingSessionDto> CancelSessionAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CancelVotingSessionRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        ArgumentNullException.ThrowIfNull(request);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var reason = (request.Reason ?? string.Empty).Trim();
        if (reason.Length < 5)
        {
            throw new DomainException("El motivo de anulación es obligatorio (mínimo 5 caracteres).");
        }

        if (reason.Length > 2000)
        {
            throw new DomainException("El motivo de anulación excede el máximo permitido.");
        }

        var session = await LoadOpenSessionForMutationAsync(assemblyId, votingSessionId, cancellationToken);
        EnsureConcurrency(session, request.ExpectedConcurrencyStamp);

        var ballots = await _db.Votes.CountAsync(v => v.VotingSessionId == session.Id, cancellationToken);
        var motion = await _db.Motions
            .FirstOrDefaultAsync(m => m.Id == session.MotionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{session.MotionId}' was not found.");

        var now = DateTimeOffset.UtcNow;
        session.Status = VotingSessionStatus.Cancelled;
        session.CancellationReason = reason;
        session.CancelledAtUtc = now;
        session.CancelledByUserId = userId;
        session.ConcurrencyStamp = Guid.NewGuid();
        session.UpdatedAtUtc = now;
        // Do NOT delete votes.

        motion.Status = ballots > 0 ? MotionStatus.Cancelled : MotionStatus.Presented;
        motion.ConcurrencyStamp = Guid.NewGuid();
        motion.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);

        var dto = await ToSessionDtoAsync(session, cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.VotingCancelled,
            assemblyId,
            metadata: new
            {
                VotingSessionId = session.Id,
                MotionId = motion.Id,
                Reason = reason,
                AcceptedBallots = ballots,
                VersionNumber = session.VersionNumber
            },
            cancellationToken: cancellationToken);

        await _realtime.PublishVotingCancelledAsync(assemblyId, dto, cancellationToken);
        await _realtime.PublishMotionAsync(
            assemblyId,
            new Contracts.Motions.MotionDto(
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
                ballots > 0 ? "Immutable" : "Full",
                ballots,
                ballots > 0 ? "Anulada. Cree una nueva versión." : null),
            cancellationToken);

        return dto;
    }

    public async Task<IReadOnlyList<VotingVersionHistoryItemDto>> GetVersionHistoryAsync(
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

        var rootId = motion.RootMotionId ?? motion.Id;
        var chain = await _db.Motions
            .AsNoTracking()
            .Where(m => m.AssemblyId == assemblyId && (m.Id == rootId || m.RootMotionId == rootId))
            .Select(m => m.Id)
            .ToListAsync(cancellationToken);

        var sessions = await _db.VotingSessions
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId && chain.Contains(s.MotionId))
            .OrderBy(s => s.VersionNumber)
            .ThenBy(s => s.OpenedAtUtc)
            .ToListAsync(cancellationToken);

        var result = new List<VotingVersionHistoryItemDto>();
        foreach (var s in sessions)
        {
            var count = await _db.Votes.CountAsync(v => v.VotingSessionId == s.Id, cancellationToken);
            string? question = null;
            if (!string.IsNullOrWhiteSpace(s.RuleSnapshotJson))
            {
                try
                {
                    using var doc = JsonDocument.Parse(s.RuleSnapshotJson);
                    if (doc.RootElement.TryGetProperty("Question", out var q))
                    {
                        question = q.GetString();
                    }
                }
                catch (JsonException)
                {
                    /* ignore */
                }
            }

            result.Add(new VotingVersionHistoryItemDto(
                s.Id,
                s.MotionId,
                s.VersionNumber,
                s.Status.ToString(),
                question,
                s.OpenedAtUtc,
                s.ClosedAtUtc,
                s.CancelledAtUtc,
                s.CancellationReason,
                count,
                s.DecisionStatus));
        }

        return result;
    }

    public async Task<CloseVotingSessionResponse> CloseSessionAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        await using var tx = await BeginExclusiveVotingSessionAsync(votingSessionId, cancellationToken);

        var session = await _db.VotingSessions
            .FirstOrDefaultAsync(s => s.Id == votingSessionId && s.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException(
                VotingCodes.SessionNotFound,
                $"Voting session '{votingSessionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);

        if (session.Status != VotingSessionStatus.Open)
        {
            if (session.Status == VotingSessionStatus.Closed)
            {
                var existingTally = await BuildTallyAsync(
                    session,
                    session.DecisionStatus,
                    hideTrend: false,
                    cancellationToken);
                await tx.CommitAsync(cancellationToken);
                return new CloseVotingSessionResponse(
                    session.Id,
                    session.MotionId,
                    session.DecisionStatus ?? existingTally.DecisionStatus ?? "Closed",
                    existingTally);
            }

            throw new DomainException(
                VotingCodes.VotingNotOpen,
                "Only an open voting session can be closed.");
        }

        var motion = await _db.Motions
            .FirstOrDefaultAsync(m => m.Id == session.MotionId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Motion '{session.MotionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, motion.TenantId);

        var votes = await _db.Votes
            .AsNoTracking()
            .Where(v => v.VotingSessionId == votingSessionId)
            .ToListAsync(cancellationToken);

        var inFavor = votes.Where(v => v.Choice == VoteChoice.InFavor).Sum(v => v.CoefficientPercent);
        var against = votes.Where(v => v.Choice == VoteChoice.Against).Sum(v => v.CoefficientPercent);
        var abstention = votes.Where(v => v.Choice == VoteChoice.Abstention).Sum(v => v.CoefficientPercent);
        var inFavorVotes = votes.Count(v => v.Choice == VoteChoice.InFavor);
        var againstVotes = votes.Count(v => v.Choice == VoteChoice.Against);
        var abstentionVotes = votes.Count(v => v.Choice == VoteChoice.Abstention);

        var decisionRule = _decisionRules.Resolve(session.AppliedDecisionRule);
        var decision = decisionRule.Decide(new DecisionContext(
            inFavor,
            against,
            abstention,
            session.RequiredThresholdPercent,
            session.EligibleCoefficient));
        var ruleCode = session.AppliedDecisionRule ?? decisionRule.RuleCode;

        var now = DateTimeOffset.UtcNow;
        session.Status = VotingSessionStatus.Closed;
        session.ClosedAtUtc = now;
        session.UpdatedAtUtc = now;
        session.AppliedDecisionRule = ruleCode;
        session.DecisionStatus = decision.ToString();

        motion.Status = decision;
        motion.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);

        await _quorum.RecalculateAndSnapshotAsync(assemblyId, "VotingClose", cancellationToken);

        var thresholdPart = session.RequiredThresholdPercent is decimal th
            ? $" Umbral: {th:0.####}%."
            : string.Empty;
        var explanation =
            $"Método: {session.CalculationMethod}. Regla: {ruleCode}.{thresholdPart} " +
            $"A favor {inFavor:0.####}% vs en contra {against:0.####}% " +
            $"(abstención {abstention:0.####}%). Decisión: {decision}.";

        var participating = Math.Round(votes.Sum(v => v.CoefficientPercent), 4, MidpointRounding.AwayFromZero);
        var policy = ResultVisibility.Parse(session.ResultVisibilityPolicy, session.HidePartialResults);

        var tally = new VoteTallyDto(
            session.Id,
            motion.Id,
            inFavor,
            against,
            abstention,
            votes.Count,
            decision.ToString(),
            inFavorVotes,
            againstVotes,
            abstentionVotes,
            ruleCode,
            explanation,
            session.EligibleVoters,
            participating,
            session.EligibleCoefficient,
            TrendHidden: false,
            ResultVisibility.ToWire(policy),
            session.RequiredThresholdPercent,
            session.CalculationMethod);

        var response = new CloseVotingSessionResponse(
            session.Id,
            motion.Id,
            decision.ToString(),
            tally);

        await _audit.WriteAsync(
            AuditEventType.VotingClosed,
            assemblyId,
            metadata: new { VotingSessionId = session.Id, MotionId = motion.Id },
            cancellationToken: cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.ResultCalculated,
            assemblyId,
            metadata: new
            {
                VotingSessionId = session.Id,
                MotionId = motion.Id,
                Decision = decision.ToString(),
                AppliedDecisionRule = ruleCode,
                RequiredThresholdPercent = session.RequiredThresholdPercent,
                InFavor = inFavor,
                Against = against,
                Abstention = abstention,
                InFavorVotes = inFavorVotes,
                AgainstVotes = againstVotes,
                AbstentionVotes = abstentionVotes,
                VotesCast = votes.Count,
                session.EligibleVoters,
                ParticipatingCoefficient = participating
            },
            cancellationToken: cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.DecisionCreated,
            assemblyId,
            metadata: new
            {
                VotingSessionId = session.Id,
                MotionId = motion.Id,
                Decision = decision.ToString(),
                AppliedDecisionRule = ruleCode,
                RequiredThresholdPercent = session.RequiredThresholdPercent,
                InFavor = inFavor,
                Against = against
            },
            cancellationToken: cancellationToken);

        await _realtime.PublishVotingClosedAsync(assemblyId, response, cancellationToken);
        await _realtime.PublishMotionAsync(
            assemblyId,
            new Contracts.Motions.MotionDto(
                motion.Id,
                motion.AssemblyId,
                motion.AgendaItemId,
                motion.Code,
                motion.Title,
                motion.Body,
                motion.Status.ToString()),
            cancellationToken);

        return response;
    }

    public async Task<VotingSessionDto?> GetOpenSessionAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var session = await _db.VotingSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(
                s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
                cancellationToken);

        return session is null ? null : await ToSessionDtoAsync(session, cancellationToken);
    }

    private async Task<VotingSession> LoadOpenSessionForMutationAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var session = await _db.VotingSessions
            .FirstOrDefaultAsync(s => s.Id == votingSessionId && s.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException(
                VotingCodes.SessionNotFound,
                $"Voting session '{votingSessionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);

        if (session.Status != VotingSessionStatus.Open)
        {
            throw new DomainException(
                VotingCodes.VotingClosed,
                "Only an open voting session can be withdrawn or cancelled.");
        }

        return session;
    }

    private static void EnsureConcurrency(VotingSession session, Guid? expected)
    {
        if (expected is Guid stamp && stamp != Guid.Empty && stamp != session.ConcurrencyStamp)
        {
            throw new DomainException(
                "CONCURRENCY_CONFLICT",
                "Esta votación fue modificada por otro usuario. Recargue los cambios.");
        }
    }

    public async Task<bool> HasUserVotedAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken = default)
    {
        var receipt = await GetMyVoteReceiptAsync(assemblyId, votingSessionId, cancellationToken);
        return receipt is not null;
    }

    public async Task<VoteReceiptDto?> GetMyVoteReceiptAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken = default)
    {
        var status = await GetMyVoteStatusAsync(assemblyId, votingSessionId, cancellationToken);
        if (status.EvidenceId is null || status.CastAtUtc is null)
        {
            return null;
        }

        return new VoteReceiptDto(votingSessionId, status.EvidenceId.Value, status.CastAtUtc.Value);
    }

    public async Task<MyVoteStatusDto> GetMyVoteStatusAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var session = await _db.VotingSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == votingSessionId && s.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException(
                VotingCodes.SessionNotFound,
                $"Voting session '{votingSessionId}' was not found.");

        var participant = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken);

        string? unitCode = null;
        decimal? coefficient = null;
        Guid? unitId = participant?.UnitId;

        var snapshot = await _db.VotingEligibilitySnapshots
            .AsNoTracking()
            .FirstOrDefaultAsync(
                e => e.VotingSessionId == votingSessionId && e.UserId == userId,
                cancellationToken);

        if (snapshot is not null)
        {
            coefficient = snapshot.CoefficientPercent;
            unitId = snapshot.UnitId;
            unitCode = snapshot.UnitCode;
        }
        else if (participant is not null)
        {
            var reps = await _representation.GetActiveForUserAsync(assemblyId, userId, cancellationToken);
            if (reps.Count > 0)
            {
                coefficient = Math.Round(reps.Sum(r => r.CoefficientPercent), 4, MidpointRounding.AwayFromZero);
                unitId = reps[0].UnitId;
                unitCode = string.Join(", ", reps.Select(r => r.UnitCode));
            }
            else if (unitId is Guid uid)
            {
                var unit = await _db.Units.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, cancellationToken);
                unitCode = unit?.Code;
                coefficient = participant.EffectiveCoefficientPercent > 0
                    ? participant.EffectiveCoefficientPercent
                    : unit?.CoefficientPercent;
            }
            else
            {
                coefficient = participant.EffectiveCoefficientPercent;
            }
        }

        var vote = await _db.Votes
            .AsNoTracking()
            .Where(v => v.VotingSessionId == votingSessionId && v.UserId == userId)
            .Select(v => new { v.EvidenceId, v.CastAtUtc, v.CoefficientPercent, v.UnitId })
            .FirstOrDefaultAsync(cancellationToken);

        if (vote is not null)
        {
            return new MyVoteStatusDto(
                votingSessionId,
                VotingCodes.AlreadyVoted,
                vote.EvidenceId,
                vote.CastAtUtc,
                vote.CoefficientPercent,
                vote.UnitId,
                unitCode);
        }

        if (session.Status != VotingSessionStatus.Open)
        {
            return new MyVoteStatusDto(
                votingSessionId,
                VotingCodes.VotingClosed,
                null,
                null,
                coefficient,
                unitId,
                unitCode);
        }

        if (participant is null)
        {
            return new MyVoteStatusDto(
                votingSessionId,
                VotingCodes.NotParticipant,
                null,
                null,
                coefficient,
                unitId,
                unitCode);
        }

        if (session.EligibleVoters > 0 && snapshot is null)
        {
            return new MyVoteStatusDto(
                votingSessionId,
                VotingCodes.NotEligible,
                null,
                null,
                coefficient,
                unitId,
                unitCode);
        }

        if (!participant.IsAccredited
            || participant.AttendanceStatus is AttendanceStatus.Registered or AttendanceStatus.Left)
        {
            return new MyVoteStatusDto(
                votingSessionId,
                VotingCodes.NotAccredited,
                null,
                null,
                coefficient,
                unitId,
                unitCode);
        }

        return new MyVoteStatusDto(
            votingSessionId,
            VotingCodes.Eligible,
            null,
            null,
            coefficient,
            unitId,
            unitCode);
    }

    public async Task<VotingResultsDto?> TryGetOpenSessionResultsAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var session = await _db.VotingSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == votingSessionId && s.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException(
                VotingCodes.SessionNotFound,
                $"Voting session '{votingSessionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);

        if (!CanViewerSeeTrend(session))
        {
            return null;
        }

        string? decisionStatus = session.DecisionStatus;
        if (session.Status == VotingSessionStatus.Closed && decisionStatus is null)
        {
            decisionStatus = await _db.Motions
                .AsNoTracking()
                .Where(m => m.Id == session.MotionId)
                .Select(m => m.Status.ToString())
                .FirstOrDefaultAsync(cancellationToken);
        }

        var tally = await BuildTallyAsync(session, decisionStatus, hideTrend: false, cancellationToken);
        return ToResultsDto(tally);
    }

    public async Task<VoteTallyDto> GetResultsAsync(
        Guid assemblyId,
        Guid votingSessionId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var session = await _db.VotingSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == votingSessionId && s.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException(
                VotingCodes.SessionNotFound,
                $"Voting session '{votingSessionId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, session.TenantId);

        if (!CanViewerSeeTrend(session))
        {
            // Participation-only response — never leak trend.
            return await BuildTallyAsync(session, decisionStatus: null, hideTrend: true, cancellationToken);
        }

        string? decisionStatus = session.DecisionStatus;
        if (session.Status == VotingSessionStatus.Closed && decisionStatus is null)
        {
            decisionStatus = await _db.Motions
                .AsNoTracking()
                .Where(m => m.Id == session.MotionId)
                .Select(m => m.Status.ToString())
                .FirstOrDefaultAsync(cancellationToken);
        }

        return await BuildTallyAsync(session, decisionStatus, hideTrend: false, cancellationToken);
    }

    private async Task PublishParticipationPulseAsync(
        VotingSession session,
        CancellationToken cancellationToken)
    {
        var policy = ResultVisibility.Parse(session.ResultVisibilityPolicy, session.HidePartialResults);
        var broadcastTrend = policy == ResultVisibilityPolicy.LiveResults;

        if (broadcastTrend)
        {
            var tally = await BuildTallyAsync(session, decisionStatus: null, hideTrend: false, cancellationToken);
            await _realtime.PublishVoteTallyAsync(session.AssemblyId, tally, cancellationToken);
            return;
        }

        // HiddenUntilClose + PresidentOnlyLive: broadcast participation only (zeros for trend).
        // Presidents fetch live trend via authorized GET /results (not SignalR broadcast).
        var pulse = await BuildTallyAsync(session, decisionStatus: null, hideTrend: true, cancellationToken);
        await _realtime.PublishVoteTallyAsync(session.AssemblyId, pulse, cancellationToken);
    }

    private async Task<VoteTallyDto> BuildTallyAsync(
        VotingSession session,
        string? decisionStatus,
        bool hideTrend,
        CancellationToken cancellationToken)
    {
        var votes = await _db.Votes
            .AsNoTracking()
            .Where(v => v.VotingSessionId == session.Id)
            .ToListAsync(cancellationToken);

        var inFavorVotes = votes.Count(v => v.Choice == VoteChoice.InFavor);
        var againstVotes = votes.Count(v => v.Choice == VoteChoice.Against);
        var abstentionVotes = votes.Count(v => v.Choice == VoteChoice.Abstention);
        var inFavor = votes.Where(v => v.Choice == VoteChoice.InFavor).Sum(v => v.CoefficientPercent);
        var against = votes.Where(v => v.Choice == VoteChoice.Against).Sum(v => v.CoefficientPercent);
        var abstention = votes.Where(v => v.Choice == VoteChoice.Abstention).Sum(v => v.CoefficientPercent);
        var participating = Math.Round(votes.Sum(v => v.CoefficientPercent), 4, MidpointRounding.AwayFromZero);
        var policy = ResultVisibility.Parse(session.ResultVisibilityPolicy, session.HidePartialResults);

        string? explanation = null;
        if (!string.IsNullOrWhiteSpace(decisionStatus) && !string.IsNullOrWhiteSpace(session.AppliedDecisionRule))
        {
            explanation =
                $"Resultado calculado según la regla configurada ({session.AppliedDecisionRule}).";
        }

        if (hideTrend)
        {
            return new VoteTallyDto(
                session.Id,
                session.MotionId,
                0m,
                0m,
                0m,
                votes.Count,
                DecisionStatus: null,
                0,
                0,
                0,
                session.AppliedDecisionRule,
                DecisionExplanation: null,
                session.EligibleVoters,
                participating,
                session.EligibleCoefficient,
                TrendHidden: true,
                ResultVisibility.ToWire(policy));
        }

        return new VoteTallyDto(
            session.Id,
            session.MotionId,
            inFavor,
            against,
            abstention,
            votes.Count,
            decisionStatus,
            inFavorVotes,
            againstVotes,
            abstentionVotes,
            session.AppliedDecisionRule,
            explanation,
            session.EligibleVoters,
            participating,
            session.EligibleCoefficient,
            TrendHidden: false,
            ResultVisibility.ToWire(policy));
    }

    private bool CanViewerSeeTrend(VotingSession session)
    {
        if (session.Status == VotingSessionStatus.Closed)
        {
            return true;
        }

        var policy = ResultVisibility.Parse(session.ResultVisibilityPolicy, session.HidePartialResults);
        return ResultVisibility.AllowsLiveTrendForAudience(policy, IsOperatorResultsViewer());
    }

    private bool IsOperatorResultsViewer()
    {
        var perms = _currentTenant.Permissions;
        if (perms.Any(p => string.Equals(p, "vote:open", StringComparison.OrdinalIgnoreCase)
                           || string.Equals(p, "vote:close", StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        return _currentTenant.Roles.Any(r =>
            r is "President" or "Secretary" or "PHAdmin" or "Operator");
    }

    private static ResultVisibilityPolicy ResolvePolicy(
        OpenVotingSessionRequest request,
        string? motionDefaultPolicy = null)
    {
        if (!string.IsNullOrWhiteSpace(request.ResultVisibilityPolicy))
        {
            return ResultVisibility.Parse(request.ResultVisibilityPolicy, request.HidePartialResults);
        }

        if (!string.IsNullOrWhiteSpace(motionDefaultPolicy))
        {
            return ResultVisibility.Parse(motionDefaultPolicy, request.HidePartialResults);
        }

        return request.HidePartialResults
            ? ResultVisibilityPolicy.HiddenUntilClose
            : ResultVisibilityPolicy.LiveResults;
    }

    private async Task<List<EligibilityRow>> BuildEligibilityAsync(
        Guid assemblyId,
        string calculationMethod,
        CancellationToken cancellationToken)
    {
        var participants = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId
                        && p.IsAccredited
                        && p.AttendanceStatus != AttendanceStatus.Registered
                        && p.AttendanceStatus != AttendanceStatus.Left)
            .ToListAsync(cancellationToken);

        var perPerson = calculationMethod.Equals(
            VotingDesignCodes.Calculation.PerPerson,
            StringComparison.OrdinalIgnoreCase);

        var userIds = participants.Select(p => p.UserId).ToList();
        var repsByUser = await _representation.GetActiveForUsersAsync(assemblyId, userIds, cancellationToken);

        var unitIds = participants
            .Where(p => p.UnitId is Guid uid)
            .Select(p => p.UnitId!.Value)
            .ToHashSet();
        foreach (var reps in repsByUser.Values)
        {
            foreach (var rep in reps)
            {
                unitIds.Add(rep.UnitId);
            }
        }

        var unitCodes = unitIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Units.AsNoTracking()
                .Where(u => unitIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.Code, cancellationToken);

        var rows = new List<EligibilityRow>();
        foreach (var participant in participants)
        {
            var reps = repsByUser.GetValueOrDefault(participant.UserId, []);
            if (reps.Count > 0)
            {
                var coeff = perPerson
                    ? 1m
                    : Math.Round(reps.Sum(r => r.CoefficientPercent), 4, MidpointRounding.AwayFromZero);
                rows.Add(new EligibilityRow(
                    participant.UserId,
                    reps[0].UnitId,
                    coeff,
                    string.Join(", ", reps.Select(r => r.UnitCode))));
            }
            else if (participant.EffectiveCoefficientPercent > 0 || participant.UnitId is not null || perPerson)
            {
                string? code = null;
                if (participant.UnitId is Guid uid)
                {
                    unitCodes.TryGetValue(uid, out code);
                }

                rows.Add(new EligibilityRow(
                    participant.UserId,
                    participant.UnitId,
                    perPerson ? 1m : participant.EffectiveCoefficientPercent,
                    code));
            }
        }

        return rows;
    }

    private static VotingResultsDto ToResultsDto(VoteTallyDto tally) =>
        new(
            tally.VotingSessionId,
            tally.MotionId,
            tally.InFavorCoefficient,
            tally.AgainstCoefficient,
            tally.AbstentionCoefficient,
            tally.VotesCast,
            tally.DecisionStatus,
            tally.InFavorVotes,
            tally.AgainstVotes,
            tally.AbstentionVotes,
            tally.AppliedDecisionRule,
            tally.DecisionExplanation,
            tally.EligibleVoters,
            tally.ParticipatingCoefficient,
            tally.EligibleCoefficient,
            tally.TrendHidden,
            tally.ResultVisibilityPolicy,
            tally.RequiredThresholdPercent,
            tally.CalculationMethod);

    private async Task<VotingSessionDto> ToSessionDtoAsync(VotingSession session, CancellationToken cancellationToken)
    {
        string? question = null;
        if (!string.IsNullOrWhiteSpace(session.RuleSnapshotJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(session.RuleSnapshotJson);
                if (doc.RootElement.TryGetProperty("Question", out var q))
                {
                    question = q.GetString();
                }
            }
            catch (JsonException)
            {
                /* ignore malformed snapshot */
            }
        }

        var ballots = await _db.Votes.CountAsync(v => v.VotingSessionId == session.Id, cancellationToken);

        return new(
            session.Id,
            session.AssemblyId,
            session.MotionId,
            session.Status.ToString(),
            session.OpenedAtUtc,
            session.ClosedAtUtc,
            session.HidePartialResults,
            session.AppliedDecisionRule,
            session.DecisionStatus,
            session.ResultVisibilityPolicy,
            session.OpenedByUserId,
            session.EligibleVoters,
            session.EligibleCoefficient,
            session.RequiredThresholdPercent,
            session.CalculationMethod,
            session.BallotKind,
            question,
            session.VersionNumber,
            session.RootVotingSessionId,
            session.PreviousVotingSessionId,
            session.CancellationReason,
            session.CancelledAtUtc,
            ballots,
            session.ConcurrencyStamp);
    }

    private VotingSessionDto ToSessionDto(VotingSession session) =>
        new(
            session.Id,
            session.AssemblyId,
            session.MotionId,
            session.Status.ToString(),
            session.OpenedAtUtc,
            session.ClosedAtUtc,
            session.HidePartialResults,
            session.AppliedDecisionRule,
            session.DecisionStatus,
            session.ResultVisibilityPolicy,
            session.OpenedByUserId,
            session.EligibleVoters,
            session.EligibleCoefficient,
            session.RequiredThresholdPercent,
            session.CalculationMethod,
            session.BallotKind,
            null,
            session.VersionNumber,
            session.RootVotingSessionId,
            session.PreviousVotingSessionId,
            session.CancellationReason,
            session.CancelledAtUtc,
            0,
            session.ConcurrencyStamp);

    private static CastVoteResponse ToCastResponse(Vote vote, bool idempotentReplay) =>
        new(vote.Id, vote.VotingSessionId, vote.EvidenceId, vote.CastAtUtc, idempotentReplay);

    /// <summary>
    /// Serializes cast/close on the same voting session (PostgreSQL row lock).
    /// Prevents accepted votes after ClosedAt with a frozen tally that omits them.
    /// </summary>
    private async Task<IDbContextTransaction> BeginExclusiveVotingSessionAsync(
        Guid votingSessionId,
        CancellationToken cancellationToken)
    {
        if (_db is not DbContext ef)
        {
            throw new InvalidOperationException("Voting integrity requires an EF Core DbContext.");
        }

        var tx = await ef.Database.BeginTransactionAsync(cancellationToken);
        await ef.Database.ExecuteSqlInterpolatedAsync(
            $"""SELECT 1 FROM voting_sessions WHERE "Id" = {votingSessionId} FOR UPDATE""",
            cancellationToken);
        return tx;
    }

    private static string? NormalizeClientRequestId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length > 128 ? trimmed[..128] : trimmed;
    }

    private static bool IsUniqueViolation(DbUpdateException ex)
    {
        var message = ex.InnerException?.Message ?? ex.Message;
        return message.Contains("unique", StringComparison.OrdinalIgnoreCase)
               || message.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
               || message.Contains("IX_votes_", StringComparison.OrdinalIgnoreCase)
               || message.Contains("IX_voting_sessions_", StringComparison.OrdinalIgnoreCase)
               || message.Contains("23505");
    }

    private sealed record EligibilityRow(
        Guid UserId,
        Guid? UnitId,
        decimal CoefficientPercent,
        string? UnitCode);
}
