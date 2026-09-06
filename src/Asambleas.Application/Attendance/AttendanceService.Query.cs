namespace Asambleas.Application.Attendance;

using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Assemblies;
using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed partial class AttendanceService
{
    public async Task<IReadOnlyList<Guid>> ListParticipantUserIdsAsync(
        Guid assemblyId,
        string? q,
        string? status,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var query = _db.AssemblyParticipants.AsNoTracking().Where(p => p.AssemblyId == assemblyId);
        if (!string.IsNullOrWhiteSpace(status))
        {
            var st = status.Trim();
            if (string.Equals(st, "accredited", StringComparison.OrdinalIgnoreCase))
                query = query.Where(p => p.IsAccredited);
            else if (string.Equals(st, "registered", StringComparison.OrdinalIgnoreCase))
                query = query.Where(p => !p.IsAccredited && p.AttendanceStatus == AttendanceStatus.Registered);
            else if (string.Equals(st, "observed", StringComparison.OrdinalIgnoreCase))
                query = query.Where(p => p.RoleCode == "Observer");
            else if (Enum.TryParse<AttendanceStatus>(st, true, out var parsed))
                query = query.Where(p => p.AttendanceStatus == parsed);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            query = query.Where(p => p.DisplayName.ToLower().Contains(term));
        }

        return await query.OrderBy(p => p.DisplayName).Select(p => p.UserId).ToListAsync(cancellationToken);
    }

    public object GetVerifiedJoinStatus(Guid assemblyId)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var has = _verifiedJoinProofs.Peek(_currentTenant.TenantId, assemblyId, userId);
        return new VerifiedJoinStatusDto(assemblyId, userId, has);
    }

    public async Task<ParticipantsPageDto> ListParticipantsPageAsync(
        Guid assemblyId,
        int skip,
        int take,
        string? q,
        string? status,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        skip = Math.Max(0, skip);
        take = Math.Clamp(take <= 0 ? 100 : take, 1, 250);

        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var query = _db.AssemblyParticipants.AsNoTracking().Where(p => p.AssemblyId == assemblyId);
        if (!string.IsNullOrWhiteSpace(status))
        {
            var st = status.Trim();
            if (string.Equals(st, "accredited", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(p => p.IsAccredited);
            }
            else if (string.Equals(st, "registered", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(p => !p.IsAccredited && p.AttendanceStatus == AttendanceStatus.Registered);
            }
            else if (string.Equals(st, "observed", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(p => p.RoleCode == "Observer");
            }
            else if (Enum.TryParse<AttendanceStatus>(st, true, out var parsed))
            {
                query = query.Where(p => p.AttendanceStatus == parsed);
            }
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            query = query.Where(p => p.DisplayName.ToLower().Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var participants = await query
            .OrderBy(p => p.DisplayName)
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

        var userIds = participants.Select(p => p.UserId).ToList();
        var repCounts = userIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await _db.AssemblyRepresentations.AsNoTracking()
                .Where(r => r.AssemblyId == assemblyId && r.IsActive && userIds.Contains(r.RepresentativeUserId))
                .GroupBy(r => r.RepresentativeUserId)
                .Select(g => new { UserId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        var unitIds = participants.Where(p => p.UnitId is not null).Select(p => p.UnitId!.Value).Distinct().ToList();
        var unitMeta = unitIds.Count == 0
            ? new Dictionary<Guid, (string Code, decimal CoefficientPercent)>()
            : await _db.Units.AsNoTracking()
                .Where(u => unitIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => (u.Code, u.CoefficientPercent), cancellationToken);

        var items = participants.Select(p =>
        {
            string? code = null;
            decimal? coeff = p.IsAccredited ? p.EffectiveCoefficientPercent : null;
            if (p.UnitId is Guid uid && unitMeta.TryGetValue(uid, out var meta))
            {
                code = meta.Code;
                coeff ??= meta.CoefficientPercent;
            }

            var reps = repCounts.GetValueOrDefault(p.UserId, 0);
            return Mapping.ToParticipantDto(p, code, coeff, reps);
        }).ToList();

        return new ParticipantsPageDto(total, skip, take, items);
    }

    public async Task<IReadOnlyList<AttendanceExceptionItemDto>> ListExceptionsAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var participants = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId)
            .OrderBy(p => p.DisplayName)
            .ToListAsync(cancellationToken);

        var unitIds = participants.Where(p => p.UnitId != null).Select(p => p.UnitId!.Value).Distinct().ToList();
        var units = unitIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Units.AsNoTracking()
                .Where(u => unitIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.Code, cancellationToken);

        var repCounts = await _db.AssemblyRepresentations.AsNoTracking()
            .Where(r => r.AssemblyId == assemblyId && r.IsActive)
            .GroupBy(r => r.RepresentativeUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        var items = new List<AttendanceExceptionItemDto>();
        foreach (var p in participants)
        {
            string? unitCode = p.UnitId is Guid uid ? units.GetValueOrDefault(uid) : null;
            var reps = repCounts.GetValueOrDefault(p.UserId, 0);

            if (string.Equals(p.RoleCode, "Observer", StringComparison.OrdinalIgnoreCase))
            {
                items.Add(new AttendanceExceptionItemDto(
                    p.UserId, p.DisplayName, unitCode, "Observer",
                    reps, "Rol Observer", null, p.UpdatedAtUtc,
                    "Revisar", null, null));
                continue;
            }

            if (!p.IsAccredited && p.AttendanceStatus == AttendanceStatus.Registered
                && !IsDeskStaffRole(p.RoleCode))
            {
                items.Add(new AttendanceExceptionItemDto(
                    p.UserId, p.DisplayName, unitCode, "AbsentInvitee",
                    reps, "Convocado no acreditado", null, p.UpdatedAtUtc,
                    "Acreditar|Observar|Rechazar", null, null));
            }
        }

        var recent = await _db.AuditEvents.AsNoTracking()
            .Where(e => e.AssemblyId == assemblyId && e.EventType == "ATTENDANCE_EXCEPTION_RESOLVED")
            .OrderByDescending(e => e.OccurredAtUtc)
            .Take(100)
            .ToListAsync(cancellationToken);

        foreach (var ev in recent)
        {
            items.Add(new AttendanceExceptionItemDto(
                Guid.Empty,
                "(resolución auditada)",
                null,
                "Resolved",
                0,
                ev.MetadataJson,
                null,
                ev.OccurredAtUtc,
                null,
                ev.UserId?.ToString("D"),
                "Auditado"));
        }

        return items;
    }

    public async Task<AttendanceExceptionItemDto> ResolveExceptionAsync(
        Guid assemblyId,
        Guid userId,
        ResolveAttendanceExceptionRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var actor = TenantGuard.RequireUserId(_currentTenant);
        var action = (request.Action ?? string.Empty).Trim();
        if (action.Length == 0)
        {
            throw new DomainException("EXCEPTION_ACTION_REQUIRED", "Indique una acción de resolución.");
        }

        var participant = await _db.AssemblyParticipants.AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException("PARTICIPANT_NOT_FOUND", "Participante no encontrado.");

        await _audit.WriteAsync(
            "ATTENDANCE_EXCEPTION_RESOLVED",
            assemblyId,
            correlationId: Guid.NewGuid(),
            metadata: new
            {
                TargetUserId = userId,
                DisplayName = participant.DisplayName,
                Action = action,
                Reason = request.Reason,
                Note = request.Note,
                ResolvedBy = actor
            },
            cancellationToken);

        return new AttendanceExceptionItemDto(
            userId,
            participant.DisplayName,
            null,
            action,
            0,
            request.Note,
            request.Reason,
            DateTimeOffset.UtcNow,
            null,
            actor.ToString("D"),
            action);
    }

    private static bool IsDeskStaffRole(string? roleCode) =>
        roleCode is Roles.AssemblyPresident
            or Roles.AssemblySecretary
            or Roles.AssemblyOperator
            or Roles.PHAdmin
            or Roles.TenantAdmin
            or Roles.PlatformAdmin;
}
