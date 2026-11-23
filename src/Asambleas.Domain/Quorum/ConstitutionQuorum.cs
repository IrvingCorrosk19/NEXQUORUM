namespace Asambleas.Domain.Quorum;

/// <summary>
/// Formal constitution is CheckIn → InProgress.
/// Opening the desk is a different step and does not require quorum.
/// This product has no second-call or waiver exception.
/// </summary>
public static class ConstitutionQuorum
{
    public const string NotReachedCode = "QUORUM_NOT_REACHED";

    public static bool CanConstitute(decimal presentCoefficient, decimal requiredCoefficient)
    {
        if (requiredCoefficient <= 0m)
        {
            return true;
        }

        return presentCoefficient >= requiredCoefficient;
    }

    public static string BlockMessage(decimal presentCoefficient, decimal requiredCoefficient) =>
        $"No se puede constituir la asamblea. El quórum presente es {presentCoefficient:0.00}% y el mínimo configurado es {requiredCoefficient:0.00}%. " +
        "Abrir la mesa permite el ingreso; no sustituye este requisito. No hay una excepción de quórum configurada.";
}
