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
}

public sealed record AssemblyRepresentationSnapshot(
    Guid UnitId,
    string UnitCode,
    decimal CoefficientPercent,
    string Source,
    Guid? PowerId);
