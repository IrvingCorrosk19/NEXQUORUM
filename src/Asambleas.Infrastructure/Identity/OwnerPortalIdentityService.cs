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
}
