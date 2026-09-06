namespace Asambleas.Application.Abstractions;

using Asambleas.Contracts.Representation;

/// <summary>
/// Single authority for assembly representation / effective coefficient (EO-006).
/// Voting and quorum consume this — they do not recompute ownership independently.
/// </summary>
public interface IAssemblyRepresentationService
{
    Task<RepresentationPreviewDto> PreviewAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AssemblyRepresentationSnapshot>> GetActiveForUserAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<Guid, IReadOnlyList<AssemblyRepresentationSnapshot>>> GetActiveForUsersAsync(
        Guid assemblyId,
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken = default);

    Task<decimal> GetEffectiveCoefficientAsync(
        Guid assemblyId,
        Guid userId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Materialize ownership + approved power rows for accreditation.
    /// Throws on representation conflict. Does not set attendance.
    /// </summary>
    Task<IReadOnlyList<AssemblyRepresentationSnapshot>> MaterializeForAccreditationAsync(
        Guid assemblyId,
        Guid targetUserId,
        Guid accreditedByUserId,
        CancellationToken cancellationToken = default);

    /// <summary>Bulk claim resolution (ownership + approved powers) without N+1.</summary>
    Task<IReadOnlyDictionary<Guid, IReadOnlyList<AssemblyRepresentationSnapshot>>> ResolveEligibleClaimsBulkAsync(
        Guid assemblyId,
        IReadOnlyCollection<Guid> userIds,
        CancellationToken cancellationToken = default);

    /// <summary>Deactivate active representation rows for a user (deaccreditation).</summary>
    Task<int> RevokeActiveForUserAsync(
        Guid assemblyId,
        Guid targetUserId,
        CancellationToken cancellationToken = default);
}

public sealed record AssemblyRepresentationSnapshot(
    Guid UnitId,
    string UnitCode,
    decimal CoefficientPercent,
    string Source,
    Guid? PowerId);
