namespace Asambleas.Contracts.Quorum;

public sealed record QuorumStateDto(
    Guid AssemblyId,
    decimal CurrentCoefficient,
    decimal RequiredCoefficient,
    decimal RequiredPercent,
    bool QuorumReached,
    int PresentUnits,
    int EligibleUnits,
    DateTimeOffset CalculatedAtUtc,
    decimal MissingCoefficient = 0m,
    decimal EligibleCoefficientTotal = 0m,
    bool CoefficientConfigurationInvalid = false,
    string? CoefficientConfigurationMessage = null);

/// <summary>
/// Read model for room hydrate / dashboard (aligned with <see cref="QuorumStateDto"/>).
/// </summary>
public sealed record QuorumDto(
    Guid AssemblyId,
    decimal CurrentCoefficient,
    decimal RequiredCoefficient,
    decimal RequiredPercent,
    bool QuorumReached,
    int PresentUnits,
    int EligibleUnits,
    DateTimeOffset CalculatedAtUtc,
    decimal MissingCoefficient = 0m,
    decimal EligibleCoefficientTotal = 0m,
    bool CoefficientConfigurationInvalid = false,
    string? CoefficientConfigurationMessage = null);

public sealed record QuorumSnapshotDto(
    Guid Id,
    Guid AssemblyId,
    DateTimeOffset TimestampUtc,
    int PresentUnits,
    decimal PresentCoefficient,
    decimal RequiredCoefficient,
    string Status,
    string? Reason = null,
    int EligibleUnits = 0);
