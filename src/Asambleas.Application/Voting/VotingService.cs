namespace Asambleas.Application.Voting;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
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

    public VotingService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        IAssemblyRealtimePublisher realtime,
        IDecisionRule decisionRule)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _realtime = realtime;
        _decisionRule = decisionRule;
    }

    public async Task<VotingSessionDto> OpenSessionAsync(
        Guid assemblyId,
        OpenVotingSessionRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

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

        if (motion.Status is not (MotionStatus.Presented or MotionStatus.Draft))
        {
            throw new DomainException(
                VotingCodes.MotionInvalid,
                $"Voting cannot open for motion in status '{motion.Status}'.");
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

        var now = DateTimeOffset.UtcNow;
        var session = new VotingSession
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            MotionId = motion.Id,
            Status = VotingSessionStatus.Open,
            OpenedAtUtc = now,
            HidePartialResults = request.HidePartialResults
        };

        motion.Status = MotionStatus.Voting;
        motion.UpdatedAtUtc = now;

        _db.VotingSessions.Add(session);
        await _db.SaveChangesAsync(cancellationToken);

        var dto = ToSessionDto(session);

        await _audit.WriteAsync(
            AuditEventType.VotingOpened,
            assemblyId,
            metadata: new
            {
                VotingSessionId = session.Id,
                MotionId = motion.Id,
                session.HidePartialResults
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

        if (participant.AttendanceStatus is AttendanceStatus.Registered or AttendanceStatus.Left)
        {
            throw new DomainException(
                VotingCodes.NotAccredited,
                "Participant is not eligible to vote in the current attendance state.");
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

        var unitId = request.UnitId ?? participant.UnitId;
        decimal coefficient = 0m;

        if (unitId is Guid resolvedUnitId)
        {
            var unit = await _db.Units
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    u => u.Id == resolvedUnitId
                         && u.TenantId == assembly.TenantId
                         && u.PropertyHorizontalId == assembly.PropertyHorizontalId,
                    cancellationToken)
                ?? throw new DomainException(
                    VotingCodes.InvalidUnit,
                    "Unit is not valid for this assembly property.");

            coefficient = unit.CoefficientPercent;
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
            // Concurrent cast: unique (VotingSessionId, UserId) or ClientRequestId won the race.
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

        await _audit.WriteAsync(
            AuditEventType.VoteCast,
            assemblyId,
            metadata: new
            {
                votingSessionId,
                vote.Id,
                evidenceId,
                clientRequestId,
                // Choice intentionally omitted for secret ballots (ADR-006 / ADR-007).
                HidePartialResults = session.HidePartialResults
            },
            cancellationToken: cancellationToken);

        if (!session.HidePartialResults)
        {
            var tally = await BuildTallyAsync(session, decisionStatus: null, cancellationToken);
            await _realtime.PublishVoteTallyAsync(assemblyId, tally, cancellationToken);
        }
        else
        {
            // Progress without ballot content.
            var votesCast = await _db.Votes.CountAsync(v => v.VotingSessionId == votingSessionId, cancellationToken);
            await _realtime.PublishVoteTallyAsync(
                assemblyId,
                new VoteTallyDto(
                    votingSessionId,
                    session.MotionId,
                    0m,
                    0m,
                    0m,
                    votesCast,
                    DecisionStatus: null),
                cancellationToken);
        }

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
            // Concurrent close: return calculated result if already closed.
            if (session.Status == VotingSessionStatus.Closed)
            {
                var existingTally = await BuildTallyAsync(
                    session,
                    session.DecisionStatus,
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
        var ruleCode = _decisionRule.RuleCode;

        var now = DateTimeOffset.UtcNow;
        session.Status = VotingSessionStatus.Closed;
        session.ClosedAtUtc = now;
        session.UpdatedAtUtc = now;
        session.AppliedDecisionRule = ruleCode;
        session.DecisionStatus = decision.ToString();

        motion.Status = decision;
        motion.UpdatedAtUtc = now;

        await _db.SaveChangesAsync(cancellationToken);

        var explanation =
            $"Resultado calculado según la regla configurada ({ruleCode}): a favor {inFavor:0.####}% vs en contra {against:0.####}%.";

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
            explanation);

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
                VotesCast = votes.Count
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

        if (unitId is Guid uid)
        {
            var unit = await _db.Units.AsNoTracking().FirstOrDefaultAsync(u => u.Id == uid, cancellationToken);
            unitCode = unit?.Code;
            coefficient = unit?.CoefficientPercent;
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

        if (participant.AttendanceStatus is AttendanceStatus.Registered or AttendanceStatus.Left)
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

        if (session.Status == VotingSessionStatus.Open && session.HidePartialResults)
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

        var tally = await BuildTallyAsync(session, decisionStatus, cancellationToken);
        return new VotingResultsDto(
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
            tally.AppliedDecisionRule ?? session.AppliedDecisionRule,
            tally.DecisionExplanation);
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

        if (session.Status == VotingSessionStatus.Open && session.HidePartialResults)
        {
            throw new DomainException("Partial results are hidden while this voting session is open.");
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

        return await BuildTallyAsync(session, decisionStatus, cancellationToken);
    }

    private async Task<VoteTallyDto> BuildTallyAsync(
        VotingSession session,
        string? decisionStatus,
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

        string? explanation = null;
        if (!string.IsNullOrWhiteSpace(decisionStatus) && !string.IsNullOrWhiteSpace(session.AppliedDecisionRule))
        {
            explanation =
                $"Resultado calculado según la regla configurada ({session.AppliedDecisionRule}).";
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
            explanation);
    }

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
            session.DecisionStatus);

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
               || message.Contains("23505"); // PostgreSQL unique_violation
    }
}
