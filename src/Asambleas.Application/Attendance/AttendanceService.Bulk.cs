namespace Asambleas.Application.Attendance;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Representation;
using Asambleas.Domain.Attendance;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>Optimized bulk accreditation / deaccreditation (single SaveChanges + single quorum recalc).</summary>
public sealed partial class AttendanceService
{
    public const string AbsentConfirmationPhraseRequired = "ACREDITAR AUSENTES";

    public async Task<BulkAccreditResponse> AccreditBulkAsync(
        Guid assemblyId,
        BulkAccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var actorUserId = TenantGuard.RequireUserId(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is not (AssemblyStatus.CheckIn or AssemblyStatus.InProgress or AssemblyStatus.Paused))
        {
            throw new DomainException(
                AttendanceCodes.AssemblyNotOpen,
                "La mesa de acreditación no está abierta.");
        }

        var openVoting = await _db.VotingSessions.AsNoTracking().AnyAsync(
            s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
            cancellationToken);
        if (openVoting && request.IncludeAbsentInvitees)
        {
            throw new DomainException(
                AttendanceCodes.DeaccreditBlockedVoting,
                "No se puede acreditar ausentes mientras hay una votación abierta.");
        }

        if (!request.AllEligible && (request.UserIds is null || request.UserIds.Count == 0))
        {
            throw new DomainException("BULK_ACCREDIT_EMPTY", "Indique UserIds o AllEligible=true.");
        }

        var batchId = request.ClientBatchId is Guid cid && cid != Guid.Empty ? cid : Guid.NewGuid();

        await using var tx = await BeginExclusiveAssemblyAttendanceAsync(assemblyId, cancellationToken);

        // Re-check idempotency AFTER lock — closes the concurrent double-batch window.
        if (request.ClientBatchId is Guid clientBatch)
        {
            var prior = await FindBulkAuditReplayAsync(assemblyId, clientBatch, AuditEventType.BulkAccreditation, cancellationToken);
            if (prior is not null)
            {
                await tx.CommitAsync(cancellationToken);
                return prior;
            }
        }

        await EnsureAbsentForceAuthorizedAsync(request, cancellationToken);

        var presence = string.IsNullOrWhiteSpace(request.PresenceType) ? "InPerson" : request.PresenceType;
        if (!Enum.TryParse<PresenceType>(presence, ignoreCase: true, out var presenceType))
        {
            throw new DomainException($"Tipo de presencia desconocido '{presence}'.");
        }

        var method = string.IsNullOrWhiteSpace(request.Method) ? "OperatorBulkCheckIn" : request.Method;
        var targets = await ResolveAccreditTargetsAsync(assemblyId, request, cancellationToken);

        var participants = await _db.AssemblyParticipants
            .Where(p => p.AssemblyId == assemblyId && targets.Contains(p.UserId))
            .ToDictionaryAsync(p => p.UserId, cancellationToken);

        var claimsByUser = await _representation.ResolveEligibleClaimsBulkAsync(
            assemblyId, targets, cancellationToken);

        var activeReps = await _db.AssemblyRepresentations
            .Where(r => r.AssemblyId == assemblyId && r.IsActive)
            .Select(r => new { r.UnitId, r.RepresentativeUserId })
            .ToListAsync(cancellationToken);
        var unitHolder = activeReps.ToDictionary(r => r.UnitId, r => r.RepresentativeUserId);
        var namesByUser = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId)
            .Select(p => new { p.UserId, p.DisplayName })
            .ToDictionaryAsync(x => x.UserId, x => x.DisplayName, cancellationToken);

        var quorumBefore = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
        var coefficientBefore = quorumBefore?.CurrentCoefficient ?? 0m;

        var items = new List<BulkAccreditItemDto>(targets.Count);
        var exclusions = new List<BulkAccreditExclusionDto>();
        var auditEvents = new List<(string, Guid?, Guid?, object?)>();
        var now = DateTimeOffset.UtcNow;
        var succeeded = 0;
        var failed = 0;
        var skipped = 0;
        var claimedInBatch = new Dictionary<Guid, Guid>(); // unitId -> userId

        foreach (var userId in targets)
        {
            var displayName = namesByUser.GetValueOrDefault(userId, userId.ToString("D"));
            if (!participants.TryGetValue(userId, out var participant))
            {
                failed++;
                exclusions.Add(new BulkAccreditExclusionDto(userId, displayName, "NOT_ENROLLED", "No inscrito en esta asamblea"));
                items.Add(new BulkAccreditItemDto(userId, displayName, false, false, "NOT_ENROLLED", "No inscrito", null));
                continue;
            }

            if (participant.IsAccredited && Mapping.CountsTowardQuorum(participant.AttendanceStatus))
            {
                skipped++;
                items.Add(new BulkAccreditItemDto(
                    userId, displayName, true, true,
                    AttendanceCodes.AlreadyCheckedIn, "Ya acreditado",
                    participant.EffectiveCoefficientPercent));
                continue;
            }

            claimsByUser.TryGetValue(userId, out var claims);
            claims ??= Array.Empty<AssemblyRepresentationSnapshot>();
            var isOperator = IsBulkOperatorRole(participant.RoleCode);

            if (claims.Count == 0 && !isOperator)
            {
                failed++;
                var code = AttendanceCodes.NoEligibleRepresentation;
                var msg = "No elegible para acreditar";
                exclusions.Add(new BulkAccreditExclusionDto(userId, displayName, code, msg));
                items.Add(new BulkAccreditItemDto(userId, displayName, false, false, code, msg, null));
                continue;
            }

            var conflict = false;
            foreach (var claim in claims)
            {
                if (unitHolder.TryGetValue(claim.UnitId, out var holder) && holder != userId)
                {
                    failed++;
                    var holderName = namesByUser.GetValueOrDefault(holder, holder.ToString("D"));
                    var msg = $"La unidad {claim.UnitCode} ya está siendo representada por {holderName}.";
                    exclusions.Add(new BulkAccreditExclusionDto(
                        userId, displayName, AttendanceCodes.RepresentationConflict, msg));
                    items.Add(new BulkAccreditItemDto(
                        userId, displayName, false, false,
                        AttendanceCodes.RepresentationConflict, msg, null));
                    conflict = true;
                    break;
                }

                if (claimedInBatch.TryGetValue(claim.UnitId, out var other) && other != userId)
                {
                    failed++;
                    var msg = $"Conflicto de lote: unidad {claim.UnitCode} ya asignada en este batch.";
                    exclusions.Add(new BulkAccreditExclusionDto(
                        userId, displayName, AttendanceCodes.RepresentationConflict, msg));
                    items.Add(new BulkAccreditItemDto(
                        userId, displayName, false, false,
                        AttendanceCodes.RepresentationConflict, msg, null));
                    conflict = true;
                    break;
                }
            }

            if (conflict)
            {
                continue;
            }

            if (!participant.IsAccredited)
            {
                foreach (var claim in claims)
                {
                    _db.AssemblyRepresentations.Add(new AssemblyRepresentation
                    {
                        TenantId = assembly.TenantId,
                        AssemblyId = assemblyId,
                        UnitId = claim.UnitId,
                        RepresentativeUserId = userId,
                        Source = Enum.TryParse<RepresentationSource>(claim.Source, true, out var src)
                            ? src
                            : RepresentationSource.Ownership,
                        PowerId = claim.PowerId,
                        CoefficientSnapshot = claim.CoefficientPercent,
                        IsActive = true,
                        AccreditedAtUtc = now,
                        AccreditedByUserId = actorUserId
                    });
                    claimedInBatch[claim.UnitId] = userId;
                    unitHolder[claim.UnitId] = userId;
                }
            }

            var effective = Math.Round(claims.Sum(c => c.CoefficientPercent), 4, MidpointRounding.AwayFromZero);
            participant.IsAccredited = true;
            participant.AccreditedAtUtc ??= now;
            participant.AccreditedByUserId ??= actorUserId;
            participant.EffectiveCoefficientPercent = effective;
            participant.AttendanceStatus = AttendanceStatus.CheckedIn;
            participant.CheckedInAtUtc ??= now;
            participant.PresenceType = presenceType;
            participant.UnitId = claims.FirstOrDefault()?.UnitId ?? participant.UnitId;
            participant.UpdatedAtUtc = now;

            _db.AttendanceRecords.Add(new AttendanceRecord
            {
                TenantId = assembly.TenantId,
                AssemblyId = assemblyId,
                UserId = userId,
                UnitId = participant.UnitId,
                PresenceType = presenceType,
                Status = AttendanceStatus.CheckedIn,
                TimestampUtc = now
            });

            succeeded++;
            items.Add(new BulkAccreditItemDto(userId, displayName, true, false, null, null, effective));
            auditEvents.Add((
                AuditEventType.ParticipantAccredited,
                assemblyId,
                batchId,
                (object)new
                {
                    TargetUserId = userId,
                    BatchId = batchId,
                    Method = method,
                    EffectiveCoefficient = effective,
                    Units = claims.Select(c => c.UnitCode).ToArray()
                }));
        }

        try
        {
            await _db.SaveChangesAsync(cancellationToken);

            auditEvents.Add((
                AuditEventType.BulkAccreditation,
                assemblyId,
                batchId,
                (object)new
                {
                    BatchId = batchId,
                    Requested = targets.Count,
                    Succeeded = succeeded,
                    Failed = failed,
                    Skipped = skipped,
                    AllEligible = request.AllEligible,
                    IncludeAbsentInvitees = request.IncludeAbsentInvitees,
                    AbsentReason = request.AbsentAccreditationReason,
                    Method = method,
                    CoefficientBefore = coefficientBefore
                }));
            await _audit.WriteManyAsync(auditEvents, cancellationToken);

            var quorum = await _quorum.RecalculateAndSnapshotAsync(assemblyId, "BulkCheckIn", cancellationToken);
            await tx.CommitAsync(cancellationToken);

            await _realtime.PublishQuorumAsync(assemblyId, quorum, cancellationToken);

            return new BulkAccreditResponse(
                batchId,
                targets.Count,
                succeeded,
                failed,
                skipped,
                exclusions.Count,
                coefficientBefore,
                quorum.CurrentCoefficient,
                quorum.RequiredCoefficient,
                quorum.QuorumReached,
                items,
                exclusions);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex))
        {
            await tx.RollbackAsync(cancellationToken);
            throw new DomainException(
                AttendanceCodes.RepresentationConflict,
                "Conflicto concurrente de representación en acreditación masiva.",
                ex);
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public Task<BulkAccreditPreviewDto> PreviewBulkAsync(
        Guid assemblyId,
        BulkAccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        return BuildBulkPreviewFastAsync(assemblyId, request, cancellationToken);
    }

    public async Task<BulkDeaccreditPreviewDto> PreviewDeaccreditBulkAsync(
        Guid assemblyId,
        BulkDeaccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsureDeaccreditAllowedAsync(assemblyId, cancellationToken);

        var requested = (request.UserIds ?? Array.Empty<Guid>()).Distinct().ToList();
        var participants = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId && requested.Contains(p.UserId))
            .ToListAsync(cancellationToken);

        var exclusions = new List<BulkAccreditExclusionDto>();
        var accredited = participants.Where(p => p.IsAccredited).ToList();
        var already = requested.Count - participants.Count;
        foreach (var missing in requested.Except(participants.Select(p => p.UserId)))
        {
            exclusions.Add(new BulkAccreditExclusionDto(missing, missing.ToString("D"), "NOT_ENROLLED", "No inscrito"));
        }

        foreach (var p in participants.Where(p => !p.IsAccredited))
        {
            exclusions.Add(new BulkAccreditExclusionDto(
                p.UserId, p.DisplayName, AttendanceCodes.NotAccreditedForDeaccredit, "No acreditado"));
        }

        var aggregate = accredited.Sum(p => p.EffectiveCoefficientPercent);
        var quorum = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
        var before = quorum?.CurrentCoefficient ?? 0m;
        var required = quorum?.RequiredCoefficient ?? 0m;
        var after = Math.Max(0m, Math.Round(before - aggregate, 4, MidpointRounding.AwayFromZero));
        var summary =
            $"Se quitará la acreditación a {accredited.Count} participantes ({aggregate:0.####}% coeficiente). " +
            $"{participants.Count(p => !p.IsAccredited)} ya no estaban acreditados.";

        return new BulkDeaccreditPreviewDto(
            assemblyId,
            requested.Count,
            accredited.Count,
            participants.Count(p => !p.IsAccredited) + already,
            exclusions.Count,
            Math.Round(aggregate, 4, MidpointRounding.AwayFromZero),
            before,
            after,
            required,
            after >= required && required > 0,
            summary,
            exclusions);
    }

    public async Task<BulkDeaccreditResponse> DeaccreditBulkAsync(
        Guid assemblyId,
        BulkDeaccreditRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 5)
        {
            throw new DomainException("DEACCREDIT_REASON_REQUIRED", "Indique un motivo de al menos 5 caracteres.");
        }

        TenantGuard.EnsureAuthenticated(_currentTenant);
        var actorUserId = TenantGuard.RequireUserId(_currentTenant);
        await EnsureDeaccreditAllowedAsync(assemblyId, cancellationToken);

        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstAsync(a => a.Id == assemblyId, cancellationToken);

        var batchId = request.ClientBatchId is Guid cid && cid != Guid.Empty ? cid : Guid.NewGuid();
        var requested = request.UserIds.Distinct().ToList();
        if (requested.Count == 0)
        {
            throw new DomainException("BULK_DEACCREDIT_EMPTY", "Indique UserIds para desacreditar.");
        }

        await using var tx = await BeginExclusiveAssemblyAttendanceAsync(assemblyId, cancellationToken);

        var participants = await _db.AssemblyParticipants
            .Where(p => p.AssemblyId == assemblyId && requested.Contains(p.UserId))
            .ToListAsync(cancellationToken);

        var reps = await _db.AssemblyRepresentations
            .Where(r => r.AssemblyId == assemblyId
                        && r.IsActive
                        && requested.Contains(r.RepresentativeUserId))
            .ToListAsync(cancellationToken);

        var quorumBefore = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
        var coefficientBefore = quorumBefore?.CurrentCoefficient ?? 0m;
        var now = DateTimeOffset.UtcNow;
        var method = request.Method ?? "OperatorBulkDeaccredit";
        var items = new List<BulkAccreditItemDto>();
        var auditEvents = new List<(string, Guid?, Guid?, object?)>();
        var succeeded = 0;
        var failed = 0;
        var skipped = 0;

        var byUser = participants.ToDictionary(p => p.UserId);
        foreach (var userId in requested)
        {
            if (!byUser.TryGetValue(userId, out var participant))
            {
                failed++;
                items.Add(new BulkAccreditItemDto(userId, userId.ToString("D"), false, false, "NOT_ENROLLED", "No inscrito", null));
                continue;
            }

            if (!participant.IsAccredited)
            {
                skipped++;
                items.Add(new BulkAccreditItemDto(
                    userId, participant.DisplayName, true, true,
                    AttendanceCodes.NotAccreditedForDeaccredit, "Ya no acreditado", 0m));
                continue;
            }

            var previous = participant.EffectiveCoefficientPercent;
            foreach (var row in reps.Where(r => r.RepresentativeUserId == userId))
            {
                row.IsActive = false; // historical row retained
            }

            participant.IsAccredited = false;
            participant.AccreditedAtUtc = null;
            participant.AccreditedByUserId = null;
            participant.EffectiveCoefficientPercent = 0m;
            participant.AttendanceStatus = AttendanceStatus.Registered;
            participant.CheckedInAtUtc = null;
            participant.PresenceType = null;
            participant.UpdatedAtUtc = now;

            _db.AttendanceRecords.Add(new AttendanceRecord
            {
                TenantId = assembly.TenantId,
                AssemblyId = assemblyId,
                UserId = userId,
                UnitId = participant.UnitId,
                PresenceType = PresenceType.InPerson,
                Status = AttendanceStatus.Registered,
                TimestampUtc = now
            });

            succeeded++;
            items.Add(new BulkAccreditItemDto(userId, participant.DisplayName, true, false, null, null, previous));
            auditEvents.Add((
                AuditEventType.ParticipantDeaccredited,
                assemblyId,
                batchId,
                (object)new
                {
                    TargetUserId = userId,
                    BatchId = batchId,
                    DeaccreditedBy = actorUserId,
                    Reason = request.Reason.Trim(),
                    Method = method,
                    PreviousCoefficient = previous
                }));
        }

        try
        {
            await _db.SaveChangesAsync(cancellationToken);

            auditEvents.Add((
                "BULK_DEACCREDITATION",
                assemblyId,
                batchId,
                (object)new
                {
                    BatchId = batchId,
                    Requested = requested.Count,
                    Succeeded = succeeded,
                    Failed = failed,
                    Skipped = skipped,
                    Reason = request.Reason.Trim(),
                    Method = method,
                    CoefficientBefore = coefficientBefore
                }));
            await _audit.WriteManyAsync(auditEvents, cancellationToken);

            var quorum = await _quorum.RecalculateAndSnapshotAsync(assemblyId, "BulkDeaccredit", cancellationToken);
            await tx.CommitAsync(cancellationToken);
            await _realtime.PublishQuorumAsync(assemblyId, quorum, cancellationToken);

            return new BulkDeaccreditResponse(
                batchId,
                requested.Count,
                succeeded,
                failed,
                skipped,
                coefficientBefore,
                quorum.CurrentCoefficient,
                quorum.RequiredCoefficient,
                quorum.QuorumReached,
                items);
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private async Task EnsureAbsentForceAuthorizedAsync(BulkAccreditRequest request, CancellationToken cancellationToken)
    {
        if (!request.IncludeAbsentInvitees && !request.ConfirmAccreditAbsentInvitees)
        {
            return;
        }

        // Treat ConfirmAccreditAbsentInvitees without IncludeAbsent as legacy alias requiring force path.
        if (!request.IncludeAbsentInvitees && request.ConfirmAccreditAbsentInvitees)
        {
            throw new DomainException(
                AttendanceCodes.BulkConfirmAbsentRequired,
                "La acción normal no acredita ausentes. Use IncludeAbsentInvitees con permiso attendance:force-absent, " +
                $"frase '{AbsentConfirmationPhraseRequired}' y motivo obligatorio.");
        }

        if (!_currentTenant.Permissions.Contains(Permissions.AttendanceForceAbsent)
            && !RolePermissionMap.HasPermission(_currentTenant.Roles, Permissions.AttendanceForceAbsent))
        {
            throw new DomainException(
                "FORBIDDEN_FORCE_ABSENT",
                "No tiene permiso attendance:force-absent para acreditar convocados ausentes.");
        }

        if (!string.Equals(
                request.AbsentConfirmationPhrase?.Trim(),
                AbsentConfirmationPhraseRequired,
                StringComparison.Ordinal))
        {
            throw new DomainException(
                AttendanceCodes.BulkConfirmAbsentRequired,
                $"Escriba exactamente la frase '{AbsentConfirmationPhraseRequired}' para confirmar.");
        }

        if (string.IsNullOrWhiteSpace(request.AbsentAccreditationReason)
            || request.AbsentAccreditationReason.Trim().Length < 10)
        {
            throw new DomainException(
                "ABSENT_REASON_REQUIRED",
                "Indique un motivo de al menos 10 caracteres para acreditar ausentes.");
        }

        await Task.CompletedTask;
    }

    private async Task<List<Guid>> ResolveAccreditTargetsAsync(
        Guid assemblyId,
        BulkAccreditRequest request,
        CancellationToken cancellationToken)
    {
        if (request.AllEligible)
        {
            var q = _db.AssemblyParticipants.AsNoTracking()
                .Where(p => p.AssemblyId == assemblyId && !p.IsAccredited);

            if (!request.IncludeAbsentInvitees)
            {
                // Normal path: never include pure invitees (Registered) without attendance evidence.
                q = q.Where(p => p.AttendanceStatus != AttendanceStatus.Registered);
            }

            return await q.OrderBy(p => p.DisplayName).Select(p => p.UserId).ToListAsync(cancellationToken);
        }

        var requested = request.UserIds!.Distinct().ToList();
        // Mesa selection is explicit verification — allow Registered when selected.
        return await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId && requested.Contains(p.UserId))
            .Select(p => p.UserId)
            .ToListAsync(cancellationToken);
    }

    private async Task<BulkAccreditPreviewDto> BuildBulkPreviewFastAsync(
        Guid assemblyId,
        BulkAccreditRequest request,
        CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var targets = await ResolveAccreditTargetsAsync(assemblyId, request, cancellationToken);
        var participants = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId && targets.Contains(p.UserId))
            .ToDictionaryAsync(p => p.UserId, cancellationToken);
        var alreadyAccredited = await _db.AssemblyParticipants.AsNoTracking()
            .CountAsync(p => p.AssemblyId == assemblyId && p.IsAccredited, cancellationToken);

        var claimsByUser = await _representation.ResolveEligibleClaimsBulkAsync(
            assemblyId, targets, cancellationToken);
        var activeUnitHolders = await _db.AssemblyRepresentations.AsNoTracking()
            .Where(r => r.AssemblyId == assemblyId && r.IsActive)
            .Select(r => new { r.UnitId, r.RepresentativeUserId })
            .ToDictionaryAsync(x => x.UnitId, x => x.RepresentativeUserId, cancellationToken);

        var exclusions = new List<BulkAccreditExclusionDto>();
        var newToAccredit = 0;
        var absentInvitees = 0;
        var aggregate = 0m;
        var units = new HashSet<Guid>();
        var representations = 0;

        foreach (var userId in targets)
        {
            var p = participants.GetValueOrDefault(userId);
            var displayName = p?.DisplayName ?? userId.ToString("D");
            if (p?.IsAccredited == true)
            {
                continue;
            }

            claimsByUser.TryGetValue(userId, out var claims);
            claims ??= Array.Empty<AssemblyRepresentationSnapshot>();
            var isOperator = p is not null && IsBulkOperatorRole(p.RoleCode);
            if (claims.Count == 0 && !isOperator)
            {
                exclusions.Add(new BulkAccreditExclusionDto(
                    userId, displayName, AttendanceCodes.NoEligibleRepresentation, "No elegible"));
                continue;
            }

            var conflictUnit = claims.FirstOrDefault(c =>
                activeUnitHolders.TryGetValue(c.UnitId, out var holder) && holder != userId);
            if (conflictUnit is not null)
            {
                exclusions.Add(new BulkAccreditExclusionDto(
                    userId, displayName, AttendanceCodes.RepresentationConflict,
                    $"Conflicto en unidad {conflictUnit.UnitCode}"));
                continue;
            }

            newToAccredit++;
            var coeff = claims.Sum(c => c.CoefficientPercent);
            aggregate += coeff;
            representations += claims.Count;
            foreach (var u in claims)
            {
                units.Add(u.UnitId);
            }

            if (p is not null && p.AttendanceStatus == AttendanceStatus.Registered)
            {
                absentInvitees++;
            }
        }

        var quorum = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
        var before = quorum?.CurrentCoefficient ?? 0m;
        var required = quorum?.RequiredCoefficient ?? 0m;
        var estimatedAfter = Math.Round(before + aggregate, 4, MidpointRounding.AwayFromZero);
        var requiresAbsent = absentInvitees > 0 && (request.IncludeAbsentInvitees || request.AllEligible);
        var summary =
            $"Se acreditarían {newToAccredit} propietarios / {units.Count} unidades / {aggregate:0.####}% coeficiente. " +
            $"{alreadyAccredited} ya acreditados, {exclusions.Count} excluidos." +
            (requiresAbsent ? $" ADVERTENCIA: {absentInvitees} convocados ausentes (Registered)." : string.Empty);

        return new BulkAccreditPreviewDto(
            assemblyId,
            targets.Count,
            alreadyAccredited,
            newToAccredit,
            exclusions.Count,
            absentInvitees,
            units.Count,
            representations,
            Math.Round(aggregate, 4, MidpointRounding.AwayFromZero),
            before,
            estimatedAfter,
            required,
            estimatedAfter >= required && required > 0,
            requiresAbsent,
            summary,
            exclusions);
    }

    private async Task EnsureDeaccreditAllowedAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException(AttendanceCodes.AssemblyNotOpen, "Asamblea cerrada o cancelada.");
        }

        if (assembly.Status is not (AssemblyStatus.CheckIn or AssemblyStatus.InProgress or AssemblyStatus.Paused))
        {
            throw new DomainException(AttendanceCodes.AssemblyNotOpen, "Estado no admite desacreditación.");
        }

        var openVoting = await _db.VotingSessions.AsNoTracking().AnyAsync(
            s => s.AssemblyId == assemblyId && s.Status == VotingSessionStatus.Open,
            cancellationToken);
        if (openVoting)
        {
            throw new DomainException(
                AttendanceCodes.DeaccreditBlockedVoting,
                "No se puede desacreditar con votación abierta.");
        }
    }

    private async Task<BulkAccreditResponse?> FindBulkAuditReplayAsync(
        Guid assemblyId,
        Guid batchId,
        string eventType,
        CancellationToken cancellationToken)
    {
        var json = await _db.AuditEvents.AsNoTracking()
            .Where(e => e.AssemblyId == assemblyId
                        && e.EventType == eventType
                        && e.CorrelationId == batchId)
            .OrderByDescending(e => e.OccurredAtUtc)
            .Select(e => e.MetadataJson)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        // Idempotent empty replay shell — client already has prior result.
        var quorum = await _quorum.GetLatestAsync(assemblyId, cancellationToken);
        return new BulkAccreditResponse(
            batchId,
            0,
            0,
            0,
            0,
            0,
            quorum?.CurrentCoefficient ?? 0m,
            quorum?.CurrentCoefficient ?? 0m,
            quorum?.RequiredCoefficient ?? 0m,
            quorum?.QuorumReached ?? false,
            Array.Empty<BulkAccreditItemDto>(),
            Array.Empty<BulkAccreditExclusionDto>());
    }

    private static bool IsBulkOperatorRole(string roleCode) =>
        roleCode is Roles.AssemblyPresident
            or Roles.AssemblySecretary
            or Roles.AssemblyOperator
            or Roles.PHAdmin
            or Roles.TenantAdmin
            or Roles.PlatformAdmin;

    /// <summary>
    /// Serializes accreditation mutations for an assembly (PostgreSQL transaction advisory lock).
    /// Business SaveChanges + audit WriteMany + quorum snapshot share this transaction.
    /// </summary>
    private async Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction> BeginExclusiveAssemblyAttendanceAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        if (_db is not DbContext ef)
        {
            throw new InvalidOperationException("Attendance integrity requires an EF Core DbContext.");
        }

        var tx = await ef.Database.BeginTransactionAsync(cancellationToken);
        // Row lock on assembly + PG advisory lock (no migration). In-memory providers skip SQL.
        var provider = ef.Database.ProviderName ?? string.Empty;
        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            await ef.Database.ExecuteSqlInterpolatedAsync(
                $"""SELECT 1 FROM assemblies WHERE "Id" = {assemblyId} FOR UPDATE""",
                cancellationToken);
            var bytes = assemblyId.ToByteArray();
            var k1 = BitConverter.ToInt32(bytes, 0);
            var k2 = BitConverter.ToInt32(bytes, 4);
            await ef.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT pg_advisory_xact_lock({k1}, {k2})",
                cancellationToken);
        }

        return tx;
    }
}
