namespace Asambleas.Infrastructure.Persistence.Configurations;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

internal sealed class PowerConfiguration : IEntityTypeConfiguration<Power>
{
    public void Configure(EntityTypeBuilder<Power> builder)
    {
        builder.ToTable("powers");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.EvidenceReference).HasMaxLength(512);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.UnitId);
        builder.HasIndex(x => x.RepresentativeUserId);
        builder.HasIndex(x => x.PrincipalOwnerId);
        builder.HasIndex(x => new { x.AssemblyId, x.UnitId, x.Status });
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Unit>().WithMany().HasForeignKey(x => x.UnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Owner>().WithMany().HasForeignKey(x => x.PrincipalOwnerId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AssemblyRepresentationConfiguration : IEntityTypeConfiguration<AssemblyRepresentation>
{
    public void Configure(EntityTypeBuilder<AssemblyRepresentation> builder)
    {
        builder.ToTable("assembly_representations");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.CoefficientSnapshot).HasPrecision(7, 4);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.RepresentativeUserId);
        builder.HasIndex(x => x.UnitId);
        builder.HasIndex(x => new { x.AssemblyId, x.RepresentativeUserId, x.IsActive })
            .HasDatabaseName("IX_assembly_representations_AssemblyId_RepresentativeUserId_IsActive");
        builder.HasIndex(x => new { x.AssemblyId, x.UnitId })
            .IsUnique()
            .HasFilter("\"IsActive\" = TRUE");
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Unit>().WithMany().HasForeignKey(x => x.UnitId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Power>().WithMany().HasForeignKey(x => x.PowerId).OnDelete(DeleteBehavior.SetNull);
    }
}
