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

public sealed record ForgotPasswordRequest(string Email);

public sealed record ForgotPasswordResponse(bool Accepted, string Detail);

public sealed record PasswordResetPreviewDto(
    bool IsValid,
    string? EmailMasked,
    string? OwnerDisplayName,
    string? PropertyHorizontalName,
    DateTimeOffset? ExpiresAtUtc,
    string? ErrorCode,
    string? ErrorMessage);

public sealed record CompletePasswordResetRequest(string Token, string Password);
