namespace Asambleas.Web.Security;

using Microsoft.AspNetCore.Authorization;

/// <summary>
/// Permission that can also be satisfied by an active PH membership RoleHint of PHAdmin
/// for the <c>propertyHorizontalId</c> route value (per-PH administration).
/// </summary>
public sealed class PhScopedAdminRequirement : IAuthorizationRequirement
{
    public PhScopedAdminRequirement(string permission) => Permission = permission;

    public string Permission { get; }
}
