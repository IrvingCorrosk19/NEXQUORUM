namespace Asambleas.Contracts.Auth;

public sealed record LoginRequest(string Email, string Password);

public sealed record LoginResponse(
    Guid UserId,
    string DisplayName,
    string Email,
    Guid TenantId,
    string TenantCode,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions);

public sealed record CurrentUserDto(
    Guid UserId,
    string DisplayName,
    string Email,
    Guid TenantId,
    string TenantCode,
    Guid? OrganizationId,
    Guid? PropertyHorizontalId,
    IReadOnlyList<string> Roles,
    IReadOnlyList<string> Permissions);

public sealed record LogoutResponse(bool Success);
