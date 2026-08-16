namespace Asambleas.Application.Abstractions;

/// <summary>
/// Identity bridge for owner invitations (implemented in Infrastructure).
/// </summary>
public interface IOwnerPortalIdentityService
{
    Task<Guid?> FindUserIdByEmailAsync(string email, CancellationToken cancellationToken = default);

    Task<string?> GetEmailByUserIdAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<Guid> EnsureOwnerUserAsync(
        Guid tenantId,
        Guid? organizationId,
        string email,
        string displayName,
        string password,
        CancellationToken cancellationToken = default);

    Task LinkOwnerRoleAsync(Guid userId, CancellationToken cancellationToken = default);

    Task ResetPasswordAsync(Guid userId, string newPassword, CancellationToken cancellationToken = default);

    /// <summary>
    /// Keeps AspNetUsers aligned when an owner email changes.
    /// Returns the UserId that should remain linked on the owner row (may heal stale links).
    /// </summary>
    Task<Guid?> SyncOwnerEmailChangeAsync(
        Guid? currentUserId,
        string? previousEmail,
        string newEmail,
        string displayName,
        CancellationToken cancellationToken = default);
}
