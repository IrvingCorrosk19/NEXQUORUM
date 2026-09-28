namespace Asambleas.Application.Quorum;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Quorum;
using Asambleas.Domain.Attendance;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Quorum;
using Asambleas.Domain.Services;
using Microsoft.EntityFrameworkCore;

public sealed class QuorumService
{
    public const string AssemblyStartReason = "AssemblyStart";
    public const string AssemblyEndReason = "AssemblyEnd";

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly IAssemblyRealtimePublisher _realtime;

    public QuorumService(
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

    public async Task<QuorumDto?> GetLatestAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status == AssemblyStatus.Completed)
        {
            var end = await _db.QuorumSnapshots
                .AsNoTracking()
                .Where(s => s.AssemblyId == assemblyId && s.Reason == AssemblyEndReason)
                .OrderByDescending(s => s.TimestampUtc)
                .FirstOrDefaultAsync(cancellationToken);

            if (end is not null)
            {
                return ToHistoricalDto(assembly, end);
            }

            // Legacy Completed without AssemblyEnd: last snapshot before any post-close drift preference.
            var legacy = await _db.QuorumSnapshots
                .AsNoTracking()
                .Where(s => s.AssemblyId == assemblyId)
                .OrderByDescending(s => s.TimestampUtc)
                .FirstOrDefaultAsync(cancellationToken);

            if (legacy is not null)
            {
                return ToHistoricalDto(assembly, legacy);
            }

            return null;
        }

        if (assembly.Status == AssemblyStatus.Cancelled)
        {
            var last = await _db.QuorumSnapshots
                .AsNoTracking()
                .Where(s => s.AssemblyId == assemblyId)
                .OrderByDescending(s => s.TimestampUtc)
                .FirstOrDefaultAsync(cancellationToken);

            return last is null ? null : ToHistoricalDto(assembly, last);
        }

        // Live room always recomputes from who is connected and represents a unit.
        // A stored snapshot can still count a moderator who has no percentage.
        return await CalculateReadOnlyAsync(assembly, cancellationToken);
    }

    public async Task<IReadOnlyList<QuorumSnapshotDto>> ListSnapshotsAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        return await _db.QuorumSnapshots
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId)
            .OrderByDescending(s => s.TimestampUtc)
            .Select(s => new QuorumSnapshotDto(
                s.Id,
                s.AssemblyId,
                s.TimestampUtc,
                s.PresentUnits,
                s.PresentCoefficient,
                s.RequiredCoefficient,
                s.Status.ToString(),
                s.Reason,
                s.EligibleUnits))
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Opening is the coefficient when the assembly started, maximum is the highest during the meeting,
    /// and closing is the coefficient frozen at AssemblyEnd.
    /// </summary>
    public async Task<(decimal Opening, decimal Maximum, decimal Closing)?> TryGetClosedMeetingSpanAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var snapshots = await _db.QuorumSnapshots
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId)
            .OrderBy(s => s.TimestampUtc)
            .Select(s => new QuorumSpanPoint(s.TimestampUtc, s.PresentCoefficient, s.Reason))
            .ToListAsync(cancellationToken);

        if (snapshots.Count == 0)
        {
            return null;
        }

        var startedAt = await _db.AuditEvents
            .AsNoTracking()
            .Where(e => e.AssemblyId == assemblyId && e.EventType == AuditEventType.AssemblyStarted)
            .OrderBy(e => e.OccurredAtUtc)
            .Select(e => (DateTimeOffset?)e.OccurredAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        var closing = snapshots.LastOrDefault(s => s.Reason == AssemblyEndReason) ?? snapshots[^1];
        var opening = snapshots.LastOrDefault(s => s.Reason == AssemblyStartReason);
        if (opening is null && startedAt is DateTimeOffset start)
        {
            opening = snapshots.LastOrDefault(s => s.TimestampUtc <= start)
                ?? snapshots.FirstOrDefault(s => s.TimestampUtc >= start);
        }

        opening ??= snapshots[0];

        var from = startedAt ?? opening.TimestampUtc;
        var to = closing.TimestampUtc;
        var during = snapshots.Where(s => s.TimestampUtc >= from && s.TimestampUtc <= to).ToList();
        var maximum = during.Count == 0
            ? opening.PresentCoefficient
            : during.Max(s => s.PresentCoefficient);
        maximum = Math.Max(maximum, Math.Max(opening.PresentCoefficient, closing.PresentCoefficient));

        return (opening.PresentCoefficient, maximum, closing.PresentCoefficient);
    }

    private sealed record QuorumSpanPoint(DateTimeOffset TimestampUtc, decimal PresentCoefficient, string? Reason);

    public Task<QuorumStateDto> RecalculateAndSnapshotAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default) =>
        RecalculateAndSnapshotAsync(assemblyId, reason: null, cancellationToken);

    public async Task<QuorumStateDto> RecalculateAndSnapshotAsync(
        Guid assemblyId,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (AssemblyLifecycle.IsTerminal(assembly.Status))
        {
            throw new DomainException(
                "ASSEMBLY_SEALED",
                $"Quorum cannot be recalculated while assembly is '{assembly.Status}'.");
        }

        var previous = await _db.QuorumSnapshots
            .AsNoTracking()
            .Where(s => s.AssemblyId == assemblyId)
            .OrderByDescending(s => s.TimestampUtc)
            .FirstOrDefaultAsync(cancellationToken);

        var calculation = await CalculateInternalAsync(assembly, cancellationToken);

        var snapshotReason = reason;
        if (previous is not null && string.IsNullOrWhiteSpace(snapshotReason))
        {
            var wasReached = previous.Status == QuorumStatus.Reached;
            if (!wasReached && calculation.QuorumReached)
            {
                snapshotReason = "ThresholdReached";
            }
            else if (wasReached && !calculation.QuorumReached)
            {
                snapshotReason = "ThresholdLost";
            }
        }

        var now = DateTimeOffset.UtcNow;
        var snapshot = new QuorumSnapshot
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            TimestampUtc = now,
            PresentUnits = calculation.PresentUnits,
            EligibleUnits = calculation.EligibleUnits,
            PresentCoefficient = calculation.CurrentCoefficient,
            RequiredCoefficient = calculation.RequiredCoefficient,
            Status = calculation.QuorumReached ? QuorumStatus.Reached : QuorumStatus.NotReached,
            Reason = snapshotReason
        };

        _db.QuorumSnapshots.Add(snapshot);
        await _db.SaveChangesAsync(cancellationToken);

        var state = Mapping.ToQuorumState(
            assemblyId,
            calculation.CurrentCoefficient,
            calculation.RequiredCoefficient,
            assembly.RequiredQuorumPercent,
            calculation.QuorumReached,
            calculation.PresentUnits,
            calculation.EligibleUnits,
            now,
            calculation.EligibleCoefficientTotal,
            calculation.CoefficientConfigurationInvalid,
            calculation.CoefficientConfigurationMessage,
            calculation.ContributingParticipants);

        await _audit.WriteAsync(
            AuditEventType.QuorumChanged,
            assemblyId,
            metadata: new
            {
                state.CurrentCoefficient,
                state.RequiredCoefficient,
                state.QuorumReached,
                state.PresentUnits,
                state.EligibleUnits,
                state.MissingCoefficient,
                Reason = snapshotReason
            },
            cancellationToken: cancellationToken);

        if (previous is not null && previous.Status != snapshot.Status)
        {
            await _audit.WriteAsync(
                calculation.QuorumReached ? AuditEventType.QuorumReached : AuditEventType.QuorumLost,
                assemblyId,
                metadata: new { state.CurrentCoefficient, state.RequiredCoefficient },
                cancellationToken: cancellationToken);
        }

        await _realtime.PublishQuorumAsync(assemblyId, state, cancellationToken);

        return state;
    }

    private static QuorumDto ToHistoricalDto(Domain.Entities.Assembly assembly, QuorumSnapshot snapshot)
    {
        var missing = snapshot.Status == QuorumStatus.Reached
            ? 0m
            : Math.Max(0m, Math.Round(snapshot.RequiredCoefficient - snapshot.PresentCoefficient, 4, MidpointRounding.AwayFromZero));

        var (invalid, message) = DiagnoseCoefficientConfiguration(
            eligibleTotal: null,
            requiredPercent: assembly.RequiredQuorumPercent);

        return new QuorumDto(
            assembly.Id,
            snapshot.PresentCoefficient,
            snapshot.RequiredCoefficient,
            assembly.RequiredQuorumPercent,
            snapshot.Status == QuorumStatus.Reached,
            snapshot.PresentUnits,
            snapshot.EligibleUnits,
            snapshot.TimestampUtc,
            missing,
            EligibleCoefficientTotal: 0m,
            CoefficientConfigurationInvalid: invalid,
            CoefficientConfigurationMessage: message);
    }

    private async Task<QuorumDto> CalculateReadOnlyAsync(
        Domain.Entities.Assembly assembly,
        CancellationToken cancellationToken)
    {
        var calculation = await CalculateInternalAsync(assembly, cancellationToken);
        var missing = calculation.QuorumReached
            ? 0m
            : Math.Max(0m, Math.Round(calculation.RequiredCoefficient - calculation.CurrentCoefficient, 4, MidpointRounding.AwayFromZero));

        return new QuorumDto(
            assembly.Id,
            calculation.CurrentCoefficient,
            calculation.RequiredCoefficient,
            assembly.RequiredQuorumPercent,
            calculation.QuorumReached,
            calculation.PresentUnits,
            calculation.EligibleUnits,
            DateTimeOffset.UtcNow,
            missing,
            calculation.EligibleCoefficientTotal,
            calculation.CoefficientConfigurationInvalid,
            calculation.CoefficientConfigurationMessage,
            calculation.ContributingParticipants);
    }

    /// <summary>
    /// Live quorum counts participants whose room presence is Present and who represent a unit with a percentage above zero.
    /// A disconnect, a moderator present only as Mesa, and convocation alone do not count.
    /// The same unit is never summed twice across reconnections or co-owners.
    /// </summary>
    private async Task<(
        decimal CurrentCoefficient,
        decimal RequiredCoefficient,
        bool QuorumReached,
        int PresentUnits,
        int EligibleUnits,
        decimal EligibleCoefficientTotal,
        bool CoefficientConfigurationInvalid,
        string? CoefficientConfigurationMessage,
        int ContributingParticipants)> CalculateInternalAsync(
        Domain.Entities.Assembly assembly,
        CancellationToken cancellationToken)
    {
        var eligibleUnits = await _db.Units
            .AsNoTracking()
            .Where(u => u.TenantId == assembly.TenantId
                        && u.PropertyHorizontalId == assembly.PropertyHorizontalId
                        && u.IsActive)
            .Select(u => new { u.Id, u.CoefficientPercent })
            .ToListAsync(cancellationToken);
        var eligibleById = eligibleUnits
            .Where(u => u.CoefficientPercent > 0)
            .ToDictionary(u => u.Id, u => u.CoefficientPercent);

        var connected = await _db.AssemblyParticipants
            .AsNoTracking()
            .Where(p => p.AssemblyId == assembly.Id
                        && p.AttendanceStatus == AttendanceStatus.Present)
            .Select(p => new { p.UserId, p.UnitId, p.EffectiveCoefficientPercent })
            .ToListAsync(cancellationToken);

        var connectedUserIds = connected.Select(p => p.UserId).Distinct().ToList();
        var representationRows = connectedUserIds.Count == 0
            ? []
            : await _db.AssemblyRepresentations
                .AsNoTracking()
                .Where(r => r.AssemblyId == assembly.Id
                            && r.IsActive
                            && r.CoefficientSnapshot > 0
                            && connectedUserIds.Contains(r.RepresentativeUserId))
                .Select(r => new { r.UnitId, r.RepresentativeUserId, r.CoefficientSnapshot })
                .ToListAsync(cancellationToken);

        var unitCoefficient = new Dictionary<Guid, decimal>();
        var contributors = new HashSet<Guid>();
        foreach (var row in representationRows)
        {
            if (!eligibleById.ContainsKey(row.UnitId) || row.CoefficientSnapshot <= 0)
            {
                continue;
            }

            contributors.Add(row.RepresentativeUserId);
            if (!unitCoefficient.TryGetValue(row.UnitId, out var existing) || row.CoefficientSnapshot > existing)
            {
                unitCoefficient[row.UnitId] = row.CoefficientSnapshot;
            }
        }

        // Legacy rows with no representation: only an assigned coefficient counts.
        // A UnitId alone does not pull the padrón percentage onto a moderator.
        foreach (var participant in connected)
        {
            if (participant.EffectiveCoefficientPercent <= 0 || participant.UnitId is not Guid unitId)
            {
                continue;
            }

            if (!eligibleById.ContainsKey(unitId))
            {
                continue;
            }

            contributors.Add(participant.UserId);
            if (!unitCoefficient.ContainsKey(unitId))
            {
                unitCoefficient[unitId] = participant.EffectiveCoefficientPercent;
            }
        }

        var calculation = QuorumEngine.Calculate(
            eligibleUnits.Select(u => u.CoefficientPercent),
            unitCoefficient.Values,
            assembly.RequiredQuorumPercent);

        var (invalid, message) = DiagnoseCoefficientConfiguration(
            calculation.EligibleCoefficientTotal,
            assembly.RequiredQuorumPercent);

        return (
            calculation.CurrentCoefficient,
            calculation.RequiredCoefficient,
            calculation.QuorumReached,
            unitCoefficient.Count,
            eligibleUnits.Count,
            calculation.EligibleCoefficientTotal,
            invalid,
            message,
            contributors.Count);
    }

    /// <summary>
    /// PH unit coefficients must sum to ~100%. RequiredQuorumPercent is 0–100 of that total.
    /// When Σ≠100, required coefficient points can exceed 100 (e.g. 381×50%=190.50) — invalid config, not double-count.
    /// </summary>
    public static (bool Invalid, string? Message) DiagnoseCoefficientConfiguration(
        decimal? eligibleTotal,
        decimal requiredPercent)
    {
        if (requiredPercent is < 0 or > 100)
        {
            return (true,
                $"El porcentaje de quórum requerido ({requiredPercent:0.####}%) está fuera del rango 0–100.");
        }

        if (eligibleTotal is null)
        {
            return (false, null);
        }

        if (!PhOnboarding.CoefficientValidator.IsComplete(eligibleTotal.Value))
        {
            var delta = PhOnboarding.CoefficientValidator.Delta(eligibleTotal.Value);
            return (true,
                $"La suma de coeficientes de las unidades activas es {eligibleTotal.Value:0.####}%. " +
                $"Debe ser 100.00% antes de iniciar la asamblea (diferencia {delta:0.####}%). " +
                "Esto no es el quórum legal requerido — es un padrón inválido.");
        }

        return (false, null);
    }

    public async Task EnsureCoefficientConfigurationAllowsProgressAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        var total = await _db.Units.AsNoTracking()
            .Where(u => u.TenantId == assembly.TenantId
                        && u.PropertyHorizontalId == assembly.PropertyHorizontalId
                        && u.IsActive)
            .SumAsync(u => u.CoefficientPercent, cancellationToken);

        var (invalid, message) = DiagnoseCoefficientConfiguration(total, assembly.RequiredQuorumPercent);
        if (invalid)
        {
            throw new DomainException(
                AttendanceCodes.CoefficientConfigurationInvalid,
                message ?? "Configuración de coeficientes / quórum inválida.");
        }
    }

    public async Task<CoefficientPadronDiagnosticDto> GetCoefficientPadronDiagnosticAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        var units = await _db.Units.AsNoTracking()
            .Where(u => u.TenantId == assembly.TenantId
                        && u.PropertyHorizontalId == assembly.PropertyHorizontalId)
            .OrderBy(u => u.Code)
            .ToListAsync(cancellationToken);

        var unitIds = units.Select(u => u.Id).ToList();
        var ownershipCounts = unitIds.Count == 0
            ? new Dictionary<Guid, int>()
            : await _db.Ownerships.AsNoTracking()
                .Where(o => o.IsActive && unitIds.Contains(o.UnitId))
                .GroupBy(o => o.UnitId)
                .Select(g => new { UnitId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.UnitId, x => x.Count, cancellationToken);

        var codeGroups = units
            .GroupBy(u => u.Code.Trim().ToUpperInvariant())
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var activeSum = PhOnboarding.CoefficientValidator.Normalize(
            units.Where(u => u.IsActive).Sum(u => u.CoefficientPercent));
        var (invalid, message) = DiagnoseCoefficientConfiguration(activeSum, assembly.RequiredQuorumPercent);
        var delta = PhOnboarding.CoefficientValidator.Delta(activeSum);

        var rows = units.Select(u =>
        {
            var dup = codeGroups.Contains(u.Code.Trim().ToUpperInvariant());
            string? obs = null;
            if (!u.IsActive) obs = "Unidad inactiva";
            else if (u.CoefficientPercent < 0) obs = "Coeficiente negativo";
            else if (dup) obs = "Código duplicado";
            else if (ownershipCounts.GetValueOrDefault(u.Id, 0) == 0) obs = "Sin ownership activo";

            return new CoefficientPadronRowDto(
                u.Id,
                u.Code,
                u.CoefficientPercent,
                u.IsActive,
                ownershipCounts.GetValueOrDefault(u.Id, 0),
                dup,
                obs);
        }).ToList();

        return new CoefficientPadronDiagnosticDto(
            assembly.PropertyHorizontalId,
            assemblyId,
            activeSum,
            PhOnboarding.CoefficientValidator.ExpectedTotal,
            delta,
            invalid,
            message ?? (invalid ? "Padrón inválido" : "Padrón válido (suma ≈ 100%)"),
            PhOnboarding.CoefficientValidator.Tolerance,
            rows);
    }

    public async Task<string> ExportCoefficientPadronCsvAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        var diag = await GetCoefficientPadronDiagnosticAsync(assemblyId, cancellationToken);
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("UnitCode,CoefficientPercent,IsActive,ActiveOwnershipCount,PossibleDuplicate,Observation,SumActive,DeltaFrom100,IsInvalid");
        foreach (var r in diag.Rows)
        {
            sb.Append(CsvEscape(r.UnitCode)).Append(',')
                .Append(r.CoefficientPercent.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append(',')
                .Append(r.IsActive ? "true" : "false").Append(',')
                .Append(r.ActiveOwnershipCount).Append(',')
                .Append(r.PossibleDuplicateCode ? "true" : "false").Append(',')
                .Append(CsvEscape(r.Observation)).Append(',')
                .Append(diag.SumActiveCoefficients.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append(',')
                .Append(diag.DeltaFrom100.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append(',')
                .Append(diag.IsInvalid ? "true" : "false")
                .AppendLine();
        }

        return sb.ToString();
    }

    private static string CsvEscape(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
        {
            return "\"" + value.Replace("\"", "\"\"") + "\"";
        }

        return value;
    }
}
