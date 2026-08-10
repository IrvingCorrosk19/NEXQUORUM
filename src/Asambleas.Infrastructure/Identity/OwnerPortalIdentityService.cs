namespace Asambleas.Infrastructure.Identity;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Security;
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
            var detail = string.Join("; ", result.Errors.Select(e => e.Description));
            throw new InvalidOperationException($"Unable to create owner user: {detail}");
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
}
