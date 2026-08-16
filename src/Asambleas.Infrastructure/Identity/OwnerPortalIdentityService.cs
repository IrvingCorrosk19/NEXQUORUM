namespace Asambleas.Infrastructure.Identity;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Security;
using Asambleas.Domain.Common;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

public sealed class OwnerPortalIdentityService : IOwnerPortalIdentityService
{
    private readonly UserManager<ApplicationUser> _userManager;

    public OwnerPortalIdentityService(UserManager<ApplicationUser> userManager)
    {
        _userManager = userManager;
    }

    public async Task<Guid?> FindUserIdByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = email.Trim();
        var user = await _userManager.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Email == normalized || u.NormalizedEmail == normalized.ToUpperInvariant(), cancellationToken);
        return user?.Id;
    }

    public async Task<string?> GetEmailByUserIdAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
        return user?.Email;
    }

    public async Task<Guid> EnsureOwnerUserAsync(
        Guid tenantId,
        Guid? organizationId,
        string email,
        string displayName,
        string password,
        CancellationToken cancellationToken = default)
    {
        var existing = await FindUserIdByEmailAsync(email, cancellationToken);
        if (existing is Guid id)
        {
            await LinkOwnerRoleAsync(id, cancellationToken);
            return id;
        }

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email.Trim().ToLowerInvariant(),
            Email = email.Trim().ToLowerInvariant(),
            EmailConfirmed = true,
            TenantId = tenantId,
            OrganizationId = organizationId,
            DisplayName = displayName,
            DemoRole = Roles.Owner
        };

        var result = await _userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e =>
                    e.Code.StartsWith("Password", StringComparison.OrdinalIgnoreCase)
                    || e.Description.Contains("Passwords must", StringComparison.OrdinalIgnoreCase)))
            {
                throw new DomainException(
                    "PASSWORD_WEAK",
                    "La contraseña debe tener al menos 12 caracteres, una mayúscula, una minúscula, un número y un símbolo (ej. ! @ # $).");
            }

            var detail = string.Join("; ", result.Errors.Select(e => e.Description));
            throw new DomainException("OWNER_USER_CREATE_FAILED", $"No pudimos crear la cuenta: {detail}");
        }

        await LinkOwnerRoleAsync(user.Id, cancellationToken);
        return user.Id;
    }

    public async Task LinkOwnerRoleAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User not found.");

        if (!await _userManager.IsInRoleAsync(user, Roles.Owner))
        {
            await _userManager.AddToRoleAsync(user, Roles.Owner);
        }
    }

    public async Task ResetPasswordAsync(Guid userId, string newPassword, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new DomainException("OWNER_USER_NOT_FOUND", "No encontramos la cuenta asociada.");

        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        var result = await _userManager.ResetPasswordAsync(user, token, newPassword);
        if (result.Succeeded)
        {
            await _userManager.UpdateSecurityStampAsync(user);
            return;
        }

        if (result.Errors.Any(e =>
                e.Code.StartsWith("Password", StringComparison.OrdinalIgnoreCase)
                || e.Description.Contains("Passwords must", StringComparison.OrdinalIgnoreCase)))
        {
            throw new DomainException(
                "PASSWORD_WEAK",
                "La contraseña debe tener al menos 12 caracteres, una mayúscula, una minúscula, un número y un símbolo (ej. ! @ # $).");
        }

        var detail = string.Join("; ", result.Errors.Select(e => e.Description));
        throw new DomainException("PASSWORD_RESET_FAILED", $"No pudimos actualizar la contraseña: {detail}");
    }

    public async Task<Guid?> SyncOwnerEmailChangeAsync(
        Guid? currentUserId,
        string? previousEmail,
        string newEmail,
        string displayName,
        CancellationToken cancellationToken = default)
    {
        var targetEmail = newEmail.Trim().ToLowerInvariant();
        var previous = string.IsNullOrWhiteSpace(previousEmail)
            ? null
            : previousEmail.Trim().ToLowerInvariant();

        // 1) New email already has a login account → prefer that (heals invite/edit races).
        var userAtNew = await _userManager.Users.IgnoreQueryFilters()
            .FirstOrDefaultAsync(
                u => u.Email == targetEmail || u.NormalizedEmail == targetEmail.ToUpperInvariant(),
                cancellationToken);
        if (userAtNew is not null)
        {
            if (!string.IsNullOrWhiteSpace(displayName)
                && !string.Equals(userAtNew.DisplayName, displayName, StringComparison.Ordinal))
            {
                userAtNew.DisplayName = displayName;
                await _userManager.UpdateAsync(userAtNew);
            }

            await LinkOwnerRoleAsync(userAtNew.Id, cancellationToken);
            return userAtNew.Id;
        }

        // 2) Rename the currently linked account when it still matches the previous owner email.
        if (currentUserId is Guid linkedId)
        {
            var linked = await _userManager.Users.IgnoreQueryFilters()
                .FirstOrDefaultAsync(u => u.Id == linkedId, cancellationToken);
            if (linked is not null)
            {
                var linkedEmail = linked.Email?.Trim().ToLowerInvariant();
                var canRename = string.IsNullOrWhiteSpace(linkedEmail)
                    || string.Equals(linkedEmail, previous, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(linkedEmail, targetEmail, StringComparison.OrdinalIgnoreCase);

                if (canRename)
                {
                    await RenameUserEmailAsync(linked, targetEmail, displayName);
                    await LinkOwnerRoleAsync(linked.Id, cancellationToken);
                    return linked.Id;
                }

                // Stale link (e.g. demo seed user) — do not rename that unrelated account.
            }
        }

        // 3) Rename the account that still has the previous email.
        if (!string.IsNullOrWhiteSpace(previous)
            && !string.Equals(previous, targetEmail, StringComparison.OrdinalIgnoreCase))
        {
            var userAtOld = await _userManager.Users.IgnoreQueryFilters()
                .FirstOrDefaultAsync(
                    u => u.Email == previous || u.NormalizedEmail == previous.ToUpperInvariant(),
                    cancellationToken);
            if (userAtOld is not null)
            {
                await RenameUserEmailAsync(userAtOld, targetEmail, displayName);
                await LinkOwnerRoleAsync(userAtOld.Id, cancellationToken);
                return userAtOld.Id;
            }
        }

        // No login account for the new email yet — clear stale link so invite/reset can proceed cleanly.
        return null;
    }

    private async Task RenameUserEmailAsync(ApplicationUser user, string targetEmail, string displayName)
    {
        var setEmail = await _userManager.SetEmailAsync(user, targetEmail);
        if (!setEmail.Succeeded)
        {
            var detail = string.Join("; ", setEmail.Errors.Select(e => e.Description));
            throw new DomainException("OWNER_EMAIL_SYNC_FAILED", $"No pudimos actualizar el correo de la cuenta: {detail}");
        }

        var setUserName = await _userManager.SetUserNameAsync(user, targetEmail);
        if (!setUserName.Succeeded)
        {
            var detail = string.Join("; ", setUserName.Errors.Select(e => e.Description));
            throw new DomainException("OWNER_EMAIL_SYNC_FAILED", $"No pudimos actualizar el usuario de acceso: {detail}");
        }

        if (!string.IsNullOrWhiteSpace(displayName))
        {
            user.DisplayName = displayName;
        }

        user.EmailConfirmed = true;
        var update = await _userManager.UpdateAsync(user);
        if (!update.Succeeded)
        {
            var detail = string.Join("; ", update.Errors.Select(e => e.Description));
            throw new DomainException("OWNER_EMAIL_SYNC_FAILED", $"No pudimos guardar la cuenta: {detail}");
        }
    }
}
