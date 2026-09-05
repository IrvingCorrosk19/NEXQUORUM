namespace Asambleas.Domain.Enums;

/// <summary>Stable reason codes stored on AssemblyAccessLink.RevocationReason (never the raw token).</summary>
public static class AccessLinkRevocationReasons
{
    public const string Resent = "Resent";
    public const string Replaced = "Replaced";
    public const string AssemblyRescheduled = "AssemblyRescheduled";
    public const string AssemblyCancelled = "AssemblyCancelled";
    public const string IndividualRevoked = "IndividualRevoked";
}