namespace Asambleas.Contracts.Quorum;

public sealed record CoefficientPadronRowDto(
    Guid UnitId,
    string UnitCode,
    decimal CoefficientPercent,
    bool IsActive,
    int ActiveOwnershipCount,
    bool PossibleDuplicateCode,
    string? Observation);

public sealed record CoefficientPadronDiagnosticDto(
    Guid PropertyHorizontalId,
    Guid AssemblyId,
    decimal SumActiveCoefficients,
    decimal ExpectedTotal,
    decimal DeltaFrom100,
    bool IsInvalid,
    string Message,
    decimal DocumentedTolerance,
    IReadOnlyList<CoefficientPadronRowDto> Rows);
