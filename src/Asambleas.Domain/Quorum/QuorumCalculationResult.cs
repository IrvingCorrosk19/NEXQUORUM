namespace Asambleas.Domain.Quorum;

/// <summary>
/// Result of a coefficient-weighted quorum calculation.
/// </summary>
public sealed record QuorumCalculationResult(
    decimal CurrentCoefficient,
    decimal RequiredCoefficient,
    bool QuorumReached,
    int PresentUnits);
