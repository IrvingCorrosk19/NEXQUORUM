namespace Asambleas.Domain.Enums;

/// <summary>Stable reason codes stored on AssemblyAccessLink.RevocationReason (never the raw token).</summary>
public static class AccessLinkRevocationReasons
{
    /// <summary>Legacy: older builds rotated tokens on every resend. Resend must no longer revoke.</summary>
    public const string Resent = "Resent";

    public const string Replaced = "Replaced";

    /// <summary>Admin explicitly regenerated a new join link for one recipient.</summary>
    public const string Regenerated = "Regenerated";

    /// <summary>Legacy: older builds rotated tokens on reschedule. Reschedule must only refresh expiry.</summary>
    public const string AssemblyRescheduled = "AssemblyRescheduled";

    public const string AssemblyCancelled = "AssemblyCancelled";
    public const string IndividualRevoked = "IndividualRevoked";
}