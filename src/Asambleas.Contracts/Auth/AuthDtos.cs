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
    IReadOnlyList<string> Permissions,
    string? AvatarUrl = null,
    bool HasLocalPassword = true,
    bool IsPasswordless = false);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record ChangePasswordResponse(bool Succeeded, string Detail);

public sealed record AvatarUploadResponse(
    string AvatarUrl,
    int Width = 0,
    int Height = 0,
    long Bytes = 0,
    int SourceWidth = 0,
    int SourceHeight = 0,
    long SourceBytes = 0,
    string ContentType = "image/webp");

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

public sealed record EmailOtpRequestDto(string Email, string? ReturnUrl = null);

/// <param name="Accepted">Request was processed without revealing whether the email exists.</param>
/// <param name="DeliveryConfirmed">True only when SMTP (or allowed non-prod mock) accepted the message.</param>
public sealed record EmailOtpRequestResponse(
    bool Accepted,
    string Detail,
    DateTimeOffset? ResendAvailableAtUtc = null,
    string? SuggestedProvider = null,
    bool DeliveryConfirmed = false,
    string? ErrorCode = null);

public sealed record EmailOtpVerifyDto(string Email, string Code, string? ReturnUrl = null);

public sealed record EmailOtpVerifyResponse(
    bool Succeeded,
    string? ErrorCode,
    string Message,
    string? ReturnUrl,
    LoginResponse? User);
