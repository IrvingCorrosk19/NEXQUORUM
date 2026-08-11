namespace Asambleas.Infrastructure.Persistence.Configurations;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

internal sealed class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.ToTable("tenants");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Code).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(256).IsRequired();
        builder.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class OrganizationConfiguration : IEntityTypeConfiguration<Organization>
{
    public void Configure(EntityTypeBuilder<Organization> builder)
    {
        builder.ToTable("organizations");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Code).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(256).IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        builder.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class PropertyHorizontalConfiguration : IEntityTypeConfiguration<PropertyHorizontal>
{
    public void Configure(EntityTypeBuilder<PropertyHorizontal> builder)
    {
        builder.ToTable("property_horizontals");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.ConcurrencyStamp).HasMaxLength(64).IsConcurrencyToken();
        builder.Property(x => x.StatusBeforeDeactivate).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Code).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(256).IsRequired();
        builder.Property(x => x.LegalName).HasMaxLength(512);
        builder.Property(x => x.Country).HasMaxLength(128);
        builder.Property(x => x.StateProvince).HasMaxLength(128);
        builder.Property(x => x.City).HasMaxLength(128);
        builder.Property(x => x.Address).HasMaxLength(512);
        builder.Property(x => x.TimeZoneId).HasMaxLength(64).IsRequired();
        builder.Property(x => x.AdminEmail).HasMaxLength(256);
        builder.Property(x => x.Phone).HasMaxLength(64);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        builder.HasOne<Tenant>().WithMany().HasForeignKey(x => x.TenantId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Organization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class UnitConfiguration : IEntityTypeConfiguration<Unit>
{
    public void Configure(EntityTypeBuilder<Unit> builder)
    {
        builder.ToTable("units");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Code).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Tower).HasMaxLength(64);
        builder.Property(x => x.UnitType).HasMaxLength(64);
        builder.Property(x => x.CoefficientPercent).HasPrecision(7, 4);
        builder.Property(x => x.IsActive).HasDefaultValue(true);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.PropertyHorizontalId);
        builder.HasIndex(x => new { x.PropertyHorizontalId, x.Code }).IsUnique();
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class OwnerConfiguration : IEntityTypeConfiguration<Owner>
{
    public void Configure(EntityTypeBuilder<Owner> builder)
    {
        builder.ToTable("owners");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
        builder.Property(x => x.FirstName).HasMaxLength(128);
        builder.Property(x => x.LastName).HasMaxLength(128);
        builder.Property(x => x.IdentificationType).HasMaxLength(32);
        builder.Property(x => x.Identification).HasMaxLength(64);
        builder.Property(x => x.Email).HasMaxLength(256).IsRequired();
        builder.Property(x => x.Phone).HasMaxLength(64);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.ConcurrencyStamp).HasMaxLength(64).IsConcurrencyToken();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => x.RegisteredPropertyHorizontalId);
        builder.HasIndex(x => new { x.TenantId, x.Email }).IsUnique();
        builder.HasIndex(x => new { x.TenantId, x.IdentificationType, x.Identification });
    }
}

internal sealed class OwnershipConfiguration : IEntityTypeConfiguration<Ownership>
{
    public void Configure(EntityTypeBuilder<Ownership> builder)
    {
        builder.ToTable("ownerships");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.SharePercent).HasPrecision(7, 4);
        builder.Property(x => x.IsActive).HasDefaultValue(true);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.UnitId);
        builder.HasIndex(x => x.OwnerId);
        builder.HasIndex(x => new { x.UnitId, x.OwnerId }).IsUnique();
        builder.HasOne<Unit>().WithMany().HasForeignKey(x => x.UnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Owner>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class OwnerInvitationConfiguration : IEntityTypeConfiguration<OwnerInvitation>
{
    public void Configure(EntityTypeBuilder<OwnerInvitation> builder)
    {
        builder.ToTable("owner_invitations");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Email).HasMaxLength(256).IsRequired();
        builder.Property(x => x.TokenHash).HasMaxLength(128).IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.OwnerId);
        builder.HasIndex(x => x.TokenHash).IsUnique();
        builder.HasIndex(x => new { x.PropertyHorizontalId, x.Email });
        builder.HasOne<Owner>().WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class UserPropertyMembershipConfiguration : IEntityTypeConfiguration<UserPropertyMembership>
{
    public void Configure(EntityTypeBuilder<UserPropertyMembership> builder)
    {
        builder.ToTable("user_property_memberships");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.RoleHint).HasMaxLength(64).IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.PropertyHorizontalId);
        builder.HasIndex(x => new { x.UserId, x.PropertyHorizontalId }).IsUnique();
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}
