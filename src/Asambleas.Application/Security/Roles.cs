namespace Asambleas.Application.Security;

public static class Roles
{
    public const string PlatformAdmin = "PlatformAdmin";
    public const string TenantAdmin = "TenantAdmin";
    public const string PHAdmin = "PHAdmin";
    public const string AssemblyPresident = "AssemblyPresident";
    public const string AssemblySecretary = "AssemblySecretary";
    public const string AssemblyOperator = "AssemblyOperator";
    public const string Owner = "Owner";
    public const string Auditor = "Auditor";

    public static IReadOnlyList<string> All { get; } =
    [
        PlatformAdmin,
        TenantAdmin,
        PHAdmin,
        AssemblyPresident,
        AssemblySecretary,
        AssemblyOperator,
        Owner,
        Auditor
    ];
}
