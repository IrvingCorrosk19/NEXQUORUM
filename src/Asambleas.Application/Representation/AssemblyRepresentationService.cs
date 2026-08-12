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
            participant.AttendanceStatus.ToString());
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
            throw new DomainException(
                AttendanceCodes.NoEligibleRepresentation,
                "No eligible ownership or approved power found for accreditation.");
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
