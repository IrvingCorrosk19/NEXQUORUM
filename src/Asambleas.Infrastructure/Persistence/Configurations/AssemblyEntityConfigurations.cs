namespace Asambleas.Infrastructure.Persistence.Configurations;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

internal sealed class AssemblyConfiguration : IEntityTypeConfiguration<AssemblyEntity>
{
    public void Configure(EntityTypeBuilder<AssemblyEntity> builder)
    {
        builder.ToTable("assemblies");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Title).HasMaxLength(512).IsRequired();
        builder.Property(x => x.Modality).HasMaxLength(32).IsRequired();
        builder.Property(x => x.AssemblyKind).HasMaxLength(32).IsRequired();
        builder.Property(x => x.LocationText).HasMaxLength(512);
        builder.Property(x => x.Notes).HasMaxLength(4000);
        builder.Property(x => x.CancelReason).HasMaxLength(2000);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.RequiredQuorumPercent).HasPrecision(7, 4);
        builder.Property(x => x.SealedMinutesHash).HasMaxLength(128);
        builder.Property(x => x.SealedMinutesDocumentId).HasMaxLength(128);
        builder.Property(x => x.SealedMinutesJson);
        builder.HasIndex(x => x.ScheduledAtUtc);
        builder.Property(x => x.RowVersion).IsRowVersion();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.PropertyHorizontalId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => new { x.PropertyHorizontalId, x.ScheduledAtUtc })
            .HasDatabaseName("IX_assemblies_PropertyHorizontalId_ScheduledAtUtc");
        builder.HasIndex(x => new { x.PropertyHorizontalId, x.Status, x.ScheduledAtUtc })
            .HasDatabaseName("IX_assemblies_PropertyHorizontalId_Status_ScheduledAtUtc");
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AssemblyParticipantConfiguration : IEntityTypeConfiguration<AssemblyParticipant>
{
    public void Configure(EntityTypeBuilder<AssemblyParticipant> builder)
    {
        builder.ToTable("assembly_participants");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
        builder.Property(x => x.RoleCode).HasMaxLength(64).IsRequired();
        builder.Property(x => x.AttendanceStatus).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.EffectiveCoefficientPercent).HasPrecision(7, 4);
        builder.Property(x => x.PresenceType).HasConversion<string>().HasMaxLength(32);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => x.IsAccredited);
        builder.HasIndex(x => new { x.AssemblyId, x.UserId }).IsUnique();
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Unit>().WithMany().HasForeignKey(x => x.UnitId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class AttendanceRecordConfiguration : IEntityTypeConfiguration<AttendanceRecord>
{
    public void Configure(EntityTypeBuilder<AttendanceRecord> builder)
    {
        builder.ToTable("attendance_records");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.PresenceType).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => x.Status);
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AgendaItemConfiguration : IEntityTypeConfiguration<AgendaItem>
{
    public void Configure(EntityTypeBuilder<AgendaItem> builder)
    {
        builder.ToTable("agenda_items");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Code).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Title).HasMaxLength(512).IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => new { x.AssemblyId, x.Ordinal }).IsUnique();
        builder.HasIndex(x => new { x.AssemblyId, x.Code }).IsUnique();
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class MotionConfiguration : IEntityTypeConfiguration<Motion>
{
    public void Configure(EntityTypeBuilder<Motion> builder)
    {
        builder.ToTable("motions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Code).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Title).HasMaxLength(512).IsRequired();
        builder.Property(x => x.Body).HasMaxLength(8000).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.DesignStatus).HasMaxLength(32).IsRequired();
        builder.Property(x => x.InstrumentKind).HasMaxLength(32).IsRequired();
        builder.Property(x => x.BallotKind).HasMaxLength(32).IsRequired();
        builder.Property(x => x.CalculationMethod).HasMaxLength(32).IsRequired();
        builder.Property(x => x.DecisionRuleCode).HasMaxLength(64).IsRequired();
        builder.Property(x => x.RequiredThresholdPercent).HasPrecision(7, 4);
        builder.Property(x => x.DefaultResultVisibilityPolicy).HasMaxLength(32).IsRequired();
        builder.Property(x => x.OptionsJson).HasColumnType("jsonb");
        builder.Property(x => x.Instructions).HasMaxLength(4000);
        builder.Property(x => x.QuestionText).HasMaxLength(2000);
        builder.Property(x => x.TemplateKey).HasMaxLength(64);
        builder.Property(x => x.VersionNumber).HasDefaultValue(1);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.DesignStatus);
        builder.HasIndex(x => x.RootMotionId);
        builder.HasIndex(x => new { x.AssemblyId, x.Code }).IsUnique();
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<AgendaItem>().WithMany().HasForeignKey(x => x.AgendaItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Motion>().WithMany().HasForeignKey(x => x.PreviousMotionId).OnDelete(DeleteBehavior.Restrict);
    }
}
