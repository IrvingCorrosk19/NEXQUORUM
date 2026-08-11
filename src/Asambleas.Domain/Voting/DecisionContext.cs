namespace Asambleas.Domain.Voting;

/// <summary>
/// Inputs for a decision rule. Coefficients are server-authoritative snapshots (never from the client).
/// </summary>
public sealed record DecisionContext(
    decimal InFavorCoefficient,
    decimal AgainstCoefficient,
    decimal AbstentionCoefficient,
    decimal? RequiredThresholdPercent = null,
    decimal EligibleCoefficient = 100m);
