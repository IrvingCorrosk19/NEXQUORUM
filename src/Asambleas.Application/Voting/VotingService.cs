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

public sealed class VotingService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly IDecisionRule _decisionRule;
    private readonly IAssemblyRepresentationService _representation;
    private readonly QuorumService _quorum;

    public VotingService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime,
        IDecisionRule decisionRule,
        IAssemblyRepresentationService representation,
        QuorumService quorum)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
        _decisionRule = decisionRule;
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

        var openExists = await _db.VotingSessions.AnyAsync(
            s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
            cancellationToken);

        if (openExists)
        {
            throw new DomainException(
                VotingCodes.OpenVotingExists,
                "Another voting session is already open for this assembly.");
        }

        var policy = ResolvePolicy(request);
        var eligibility = await BuildEligibilityAsync(assemblyId, cancellationToken);
        if (eligibility.Count == 0)
        {
            throw new DomainException(
                VotingCodes.NotEligible,
                "Cannot open voting: no accredited eligible voters.");
        }

        var now = DateTimeOffset.UtcNow;
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
            AppliedDecisionRule = _decisionRule.RuleCode
        };

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

        await _quorum.RecalculateAndSnapshotAsync(assemblyId, "VotingOpen", cancellationToken);

        var dto = ToSessionDto(session);

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
            throw new DomainException(
                VotingCodes.InvalidChoice,
                $"Unknown vote choice '{request.Choice}'.");
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
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
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

        await PublishParticipationPulseAsync(session, cancellationToken);

        return ToCastResponse(vote, idempotentReplay: false);
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

        var decision = _decisionRule.Decide(inFavor, against, abstention);
        var ruleCode = session.AppliedDecisionRule ?? _decisionRule.RuleCode;

        var now = DateTimeOffset.UtcNow;
        session.Status = VotingSessionStatus.Closed;
        session.ClosedAtUtc = now;
        session.UpdatedAtUtc = now;
        session.AppliedDecisionRule = ruleCode;
        session.DecisionStatus = decision.ToString();

        motion.Status = decision;
        motion.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);

        await _quorum.RecalculateAndSnapshotAsync(assemblyId, "VotingClose", cancellationToken);

        var explanation =
            $"Método: coeficiente de copropiedad. Regla: {ruleCode}. " +
            $"A favor {inFavor:0.####}% vs en contra {against:0.####}% " +
            $"(abstención {abstention:0.####}% no decide). Decisión: {decision}.";

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
            ResultVisibility.ToWire(policy));

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

        return session is null ? null : ToSessionDto(session);
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

    private static ResultVisibilityPolicy ResolvePolicy(OpenVotingSessionRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.ResultVisibilityPolicy))
        {
            return ResultVisibility.Parse(request.ResultVisibilityPolicy, request.HidePartialResults);
        }

        return request.HidePartialResults
            ? ResultVisibilityPolicy.HiddenUntilClose
            : ResultVisibilityPolicy.LiveResults;
    }

    private async Task<List<EligibilityRow>> BuildEligibilityAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        var participants = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId
                        && p.IsAccredited
                        && p.AttendanceStatus != AttendanceStatus.Registered
                        && p.AttendanceStatus != AttendanceStatus.Left)
            .ToListAsync(cancellationToken);

        var rows = new List<EligibilityRow>();
        foreach (var participant in participants)
        {
            var reps = await _representation.GetActiveForUserAsync(assemblyId, participant.UserId, cancellationToken);
            if (reps.Count > 0)
            {
                rows.Add(new EligibilityRow(
                    participant.UserId,
                    reps[0].UnitId,
                    Math.Round(reps.Sum(r => r.CoefficientPercent), 4, MidpointRounding.AwayFromZero),
                    string.Join(", ", reps.Select(r => r.UnitCode))));
            }
            else if (participant.EffectiveCoefficientPercent > 0 || participant.UnitId is not null)
            {
                string? code = null;
                if (participant.UnitId is Guid uid)
                {
                    code = await _db.Units.AsNoTracking()
                        .Where(u => u.Id == uid)
                        .Select(u => u.Code)
                        .FirstOrDefaultAsync(cancellationToken);
                }

                rows.Add(new EligibilityRow(
                    participant.UserId,
                    participant.UnitId,
                    participant.EffectiveCoefficientPercent,
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
            tally.ResultVisibilityPolicy);

    private static VotingSessionDto ToSessionDto(VotingSession session) =>
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
            session.EligibleCoefficient);

    private static CastVoteResponse ToCastResponse(Vote vote, bool idempotentReplay) =>
        new(vote.Id, vote.VotingSessionId, vote.EvidenceId, vote.CastAtUtc, idempotentReplay);

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
