namespace Asambleas.Application.Representation;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Representation;
using Asambleas.Domain.Attendance;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class AssemblyRepresentationService : IAssemblyRepresentationService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;

    public AssemblyRepresentationService(IAsambleasDbContext db, ICurrentTenant currentTenant)
    {
        _db = db;
        _currentTenant = currentTenant;
    }

    public async Task<RepresentationPreviewDto> PreviewAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);
        var participant = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken)
            ?? throw new DomainException($"Participant '{userId}' is not registered for this assembly.");

        TenantGuard.EnsureTenantMatch(_currentTenant, participant.TenantId);

        var claims = await ResolveEligibleClaimsAsync(assembly, userId, cancellationToken);
        var conflicts = new List<RepresentationConflictDto>();
        var owned = new List<RepresentationUnitDto>();
        var represented = new List<RepresentationUnitDto>();

        foreach (var claim in claims)
        {
            var existing = await FindActiveConflictAsync(assemblyId, claim.UnitId, userId, cancellationToken);
            RepresentationUnitDto dto;
            if (existing is not null)
            {
                conflicts.Add(new RepresentationConflictDto(
                    claim.UnitId,
                    claim.UnitCode,
                    AttendanceCodes.RepresentationConflict,
                    $"La unidad {claim.UnitCode} ya está siendo representada por {existing.Value.DisplayName}.",
                    existing.Value.UserId,
                    existing.Value.DisplayName));

                dto = new RepresentationUnitDto(
                    claim.UnitId,
                    claim.UnitCode,
                    claim.Coefficient,
                    claim.Source.ToString(),
                    claim.PowerId,
                    existing.Value.DisplayName);
            }
            else
            {
                dto = new RepresentationUnitDto(
                    claim.UnitId,
                    claim.UnitCode,
                    claim.Coefficient,
                    claim.Source.ToString(),
                    claim.PowerId,
                    null);
            }

            if (claim.Source == RepresentationSource.Ownership)
            {
                owned.Add(dto);
            }
            else
            {
                represented.Add(dto);
            }
        }

        var isOperatorRole = IsOperatorRole(participant.RoleCode);
        var canAccredit = conflicts.Count == 0
                          && (claims.Count > 0 || isOperatorRole)
                          && !participant.IsAccredited;

        var effective = claims
            .Where(c => conflicts.All(x => x.UnitId != c.UnitId))
            .Sum(c => c.Coefficient);

        if (participant.IsAccredited)
        {
            effective = participant.EffectiveCoefficientPercent;
        }

        string? blockCode = null;
        string? blockMessage = null;
        if (!participant.IsAccredited && !canAccredit)
        {
            if (conflicts.Count > 0)
            {
                blockCode = AttendanceCodes.RepresentationConflict;
                blockMessage = conflicts[0].Message;
            }
            else
            {
                (blockCode, blockMessage) = await DiagnoseIneligibilityAsync(
                    assembly, userId, isOperatorRole, cancellationToken);
            }
        }

        return new RepresentationPreviewDto(
            userId,
            participant.DisplayName,
            assemblyId,
            owned,
            represented,
            Math.Round(effective, 4, MidpointRounding.AwayFromZero),
            canAccredit,
            conflicts,
            participant.IsAccredited,
            participant.AttendanceStatus.ToString(),
            blockCode,
            blockMessage);
    }

    public async Task<IReadOnlyList<AssemblyRepresentationSnapshot>> GetActiveForUserAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var map = await GetActiveForUsersAsync(assemblyId, [userId], cancellationToken);
        return map.GetValueOrDefault(userId, []);
    }

    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<AssemblyRepresentationSnapshot>>> GetActiveForUsersAsync(
        Guid assemblyId,
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        if (userIds.Count == 0)
        {
            return new Dictionary<Guid, IReadOnlyList<AssemblyRepresentationSnapshot>>();
        }

        var distinctUserIds = userIds.Distinct().ToList();
        var rows = await _db.AssemblyRepresentations
            .AsNoTracking()
            .Where(r => r.AssemblyId == assemblyId && r.IsActive && distinctUserIds.Contains(r.RepresentativeUserId))
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            return distinctUserIds.ToDictionary(id => id, _ => (IReadOnlyList<AssemblyRepresentationSnapshot>)[]);
        }

        var unitIds = rows.Select(r => r.UnitId).Distinct().ToList();
        var codes = await _db.Units
            .AsNoTracking()
            .Where(u => unitIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.Code, cancellationToken);

        return rows
            .GroupBy(r => r.RepresentativeUserId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<AssemblyRepresentationSnapshot>)g
                    .Select(r => new AssemblyRepresentationSnapshot(
                        r.UnitId,
                        codes.GetValueOrDefault(r.UnitId, "?"),
                        r.CoefficientSnapshot,
                        r.Source.ToString(),
                        r.PowerId))
                    .ToList());
    }

    public async Task<decimal> GetEffectiveCoefficientAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var snaps = await GetActiveForUserAsync(assemblyId, userId, cancellationToken);
        if (snaps.Count > 0)
        {
            return Math.Round(snaps.Sum(s => s.CoefficientPercent), 4, MidpointRounding.AwayFromZero);
        }

        var participant = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == userId, cancellationToken);

        return participant?.EffectiveCoefficientPercent ?? 0m;
    }

    public async Task<IReadOnlyList<AssemblyRepresentationSnapshot>> MaterializeForAccreditationAsync(
        Guid assemblyId,
        Guid targetUserId,
        Guid accreditedByUserId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);
        var claims = await ResolveEligibleClaimsAsync(assembly, targetUserId, cancellationToken);

        var participant = await _db.AssemblyParticipants
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == targetUserId, cancellationToken)
            ?? throw new DomainException("Participant is not registered for this assembly.");

        if (claims.Count == 0 && !IsOperatorRole(participant.RoleCode))
        {
            var (code, message) = await DiagnoseIneligibilityAsync(
                assembly, targetUserId, isOperatorRole: false, cancellationToken);
            throw new DomainException(code, message);
        }

        var now = DateTimeOffset.UtcNow;
        var snapshots = new List<AssemblyRepresentationSnapshot>();

        foreach (var claim in claims)
        {
            var conflict = await FindActiveConflictAsync(assemblyId, claim.UnitId, targetUserId, cancellationToken);
            if (conflict is not null)
            {
                throw new DomainException(
                    AttendanceCodes.RepresentationConflict,
                    $"La unidad {claim.UnitCode} ya está siendo representada por {conflict.Value.DisplayName}.");
            }

            _db.AssemblyRepresentations.Add(new AssemblyRepresentation
            {
                TenantId = assembly.TenantId,
                AssemblyId = assemblyId,
                UnitId = claim.UnitId,
                RepresentativeUserId = targetUserId,
                Source = claim.Source,
                PowerId = claim.PowerId,
                CoefficientSnapshot = claim.Coefficient,
                IsActive = true,
                AccreditedAtUtc = now,
                AccreditedByUserId = accreditedByUserId
            });

            snapshots.Add(new AssemblyRepresentationSnapshot(
                claim.UnitId,
                claim.UnitCode,
                claim.Coefficient,
                claim.Source.ToString(),
                claim.PowerId));
        }

        return snapshots;
    }

    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<AssemblyRepresentationSnapshot>>> ResolveEligibleClaimsBulkAsync(
        Guid assemblyId,
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await RequireAssemblyAsync(assemblyId, cancellationToken);
        var ids = userIds.Distinct().ToList();
        var result = ids.ToDictionary(id => id, _ => (IReadOnlyList<AssemblyRepresentationSnapshot>)Array.Empty<AssemblyRepresentationSnapshot>());
        if (ids.Count == 0)
        {
            return result;
        }

        var owners = await _db.Owners.AsNoTracking()
            .Where(o => o.TenantId == assembly.TenantId
                        && o.UserId != null
                        && ids.Contains(o.UserId.Value)
                        && (o.Status == OwnerLifecycleStatus.Active || o.Status == OwnerLifecycleStatus.Invited))
            .Select(o => new { o.Id, UserId = o.UserId!.Value })
            .ToListAsync(cancellationToken);
        var ownerIds = owners.Select(o => o.Id).ToList();

        var ownershipRows = ownerIds.Count == 0
            ? []
            : await (
                from own in _db.Ownerships.AsNoTracking()
                join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
                where ownerIds.Contains(own.OwnerId)
                      && own.IsActive
                      && u.IsActive
                      && u.PropertyHorizontalId == assembly.PropertyHorizontalId
                      && u.TenantId == assembly.TenantId
                select new { own.OwnerId, u.Id, u.Code, u.CoefficientPercent }
            ).ToListAsync(cancellationToken);

        var powerRows = await (
            from p in _db.Powers.AsNoTracking()
            join u in _db.Units.AsNoTracking() on p.UnitId equals u.Id
            where p.AssemblyId == assembly.Id
                  && ids.Contains(p.RepresentativeUserId)
                  && p.Status == PowerStatus.Approved
            select new { p.RepresentativeUserId, PowerId = p.Id, UnitId = u.Id, u.Code, u.CoefficientPercent }
        ).ToListAsync(cancellationToken);

        var buckets = ids.ToDictionary(id => id, _ => new List<AssemblyRepresentationSnapshot>());
        var userByOwner = owners.ToDictionary(o => o.Id, o => o.UserId);
        foreach (var row in ownershipRows)
        {
            if (!userByOwner.TryGetValue(row.OwnerId, out var userId))
            {
                continue;
            }

            buckets[userId].Add(new AssemblyRepresentationSnapshot(
                row.Id, row.Code, row.CoefficientPercent, RepresentationSource.Ownership.ToString(), null));
        }

        foreach (var row in powerRows)
        {
            if (buckets[row.RepresentativeUserId].Any(c => c.UnitId == row.UnitId))
            {
                continue;
            }

            buckets[row.RepresentativeUserId].Add(new AssemblyRepresentationSnapshot(
                row.UnitId, row.Code, row.CoefficientPercent, RepresentationSource.Power.ToString(), row.PowerId));
        }

        return buckets.ToDictionary(
            kv => kv.Key,
            kv => (IReadOnlyList<AssemblyRepresentationSnapshot>)kv.Value);
    }

    public async Task<int> RevokeActiveForUserAsync(
        Guid assemblyId,
        Guid targetUserId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        _ = await RequireAssemblyAsync(assemblyId, cancellationToken);

        var active = await _db.AssemblyRepresentations
            .Where(r => r.AssemblyId == assemblyId
                        && r.RepresentativeUserId == targetUserId
                        && r.IsActive)
            .ToListAsync(cancellationToken);

        foreach (var row in active)
        {
            row.IsActive = false;
        }

        return active.Count;
    }

    private async Task<(string Code, string Message)> DiagnoseIneligibilityAsync(
        Domain.Entities.Assembly assembly,
        Guid userId,
        bool isOperatorRole,
        CancellationToken cancellationToken)
    {
        if (isOperatorRole)
        {
            return (
                AttendanceCodes.NoEligibleRepresentation,
                "No hay representación elegible para acreditar.");
        }

        var owner = await _db.Owners
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.UserId == userId && o.TenantId == assembly.TenantId, cancellationToken);

        if (owner is null)
        {
            return (
                AttendanceCodes.NoEligibleRepresentation,
                "Este usuario no tiene ficha de propietario vinculada. Asigne unidad y active el propietario antes de acreditar.");
        }

        if (owner.Status == OwnerLifecycleStatus.Draft)
        {
            return (
                AttendanceCodes.OwnerDraft,
                "El propietario está en borrador (Draft) y no tiene unidades activas elegibles. Asigne una unidad y actívelo (Invitado/Activo) antes de acreditar.");
        }

        if (owner.Status == OwnerLifecycleStatus.Inactive)
        {
            return (
                AttendanceCodes.OwnerInactive,
                "El propietario está inactivo y no puede acreditarse.");
        }

        var hasOwnership = await (
            from own in _db.Ownerships.AsNoTracking()
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where own.OwnerId == owner.Id
                  && own.IsActive
                  && u.IsActive
                  && u.PropertyHorizontalId == assembly.PropertyHorizontalId
            select own.Id).AnyAsync(cancellationToken);

        if (!hasOwnership)
        {
            return (
                AttendanceCodes.OwnerMissingUnits,
                "El propietario no tiene unidades activas en esta propiedad horizontal. Asigne al menos una unidad antes de acreditar.");
        }

        return (
            AttendanceCodes.NoEligibleRepresentation,
            "No hay ownership ni poder aprobado elegible para acreditar.");
    }

    private async Task<List<EligibleClaim>> ResolveEligibleClaimsAsync(
        Domain.Entities.Assembly assembly,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var owner = await _db.Owners
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.UserId == userId && o.TenantId == assembly.TenantId, cancellationToken);

        var claims = new List<EligibleClaim>();

        // Inactive / draft owners must not become newly eligible; historical assemblies
        // already freeze Representation + Vote coefficient snapshots separately.
        if (owner is not null
            && owner.Status is OwnerLifecycleStatus.Active or OwnerLifecycleStatus.Invited)
        {
            var ownerships = await (
                from own in _db.Ownerships.AsNoTracking()
                join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
                where own.OwnerId == owner.Id
                      && own.IsActive
                      && u.IsActive
                      && u.PropertyHorizontalId == assembly.PropertyHorizontalId
                      && u.TenantId == assembly.TenantId
                select new { u.Id, u.Code, u.CoefficientPercent }
            ).ToListAsync(cancellationToken);

            foreach (var row in ownerships)
            {
                claims.Add(new EligibleClaim(
                    row.Id,
                    row.Code,
                    row.CoefficientPercent,
                    RepresentationSource.Ownership,
                    null));
            }
        }

        var powers = await (
            from p in _db.Powers.AsNoTracking()
            join u in _db.Units.AsNoTracking() on p.UnitId equals u.Id
            where p.AssemblyId == assembly.Id
                  && p.RepresentativeUserId == userId
                  && p.Status == PowerStatus.Approved
            select new { PowerId = p.Id, UnitId = u.Id, u.Code, u.CoefficientPercent }
        ).ToListAsync(cancellationToken);

        foreach (var row in powers)
        {
            // Avoid duplicate if already owned.
            if (claims.Any(c => c.UnitId == row.UnitId))
            {
                continue;
            }

            claims.Add(new EligibleClaim(
                row.UnitId,
                row.Code,
                row.CoefficientPercent,
                RepresentationSource.Power,
                row.PowerId));
        }

        return claims;
    }

    private async Task<(Guid UserId, string DisplayName)?> FindActiveConflictAsync(
        Guid assemblyId,
        Guid unitId,
        Guid candidateUserId,
        CancellationToken cancellationToken)
    {
        var existing = await _db.AssemblyRepresentations
            .AsNoTracking()
            .FirstOrDefaultAsync(
                r => r.AssemblyId == assemblyId && r.UnitId == unitId && r.IsActive,
                cancellationToken);

        if (existing is null || existing.RepresentativeUserId == candidateUserId)
        {
            return null;
        }

        var name = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId && p.UserId == existing.RepresentativeUserId)
            .Select(p => p.DisplayName)
            .FirstOrDefaultAsync(cancellationToken) ?? "otro participante";

        return (existing.RepresentativeUserId, name);
    }

    private async Task<Domain.Entities.Assembly> RequireAssemblyAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        return assembly;
    }

    private static bool IsOperatorRole(string roleCode) =>
        roleCode is Roles.AssemblyPresident
            or Roles.AssemblySecretary
            or Roles.AssemblyOperator
            or Roles.PHAdmin
            or Roles.TenantAdmin
            or Roles.PlatformAdmin;

    private sealed record EligibleClaim(
        Guid UnitId,
        string UnitCode,
        decimal Coefficient,
        RepresentationSource Source,
        Guid? PowerId);
}
