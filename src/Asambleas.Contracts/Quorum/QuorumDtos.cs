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
    decimal MissingCoefficient = 0m);

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
    decimal MissingCoefficient = 0m);

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
