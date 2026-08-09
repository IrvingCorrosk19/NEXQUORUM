namespace Asambleas.Infrastructure.Persistence.Configurations;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

internal sealed class AssemblyScheduleChangeConfiguration : IEntityTypeConfiguration<AssemblyScheduleChange>
{
    public void Configure(EntityTypeBuilder<AssemblyScheduleChange> builder)
    {
        builder.ToTable("assembly_schedule_changes");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Reason).HasMaxLength(2000).IsRequired();
        builder.Property(x => x.NotificationStatus).HasMaxLength(32).IsRequired();
        builder.Property(x => x.ImpactJson).HasColumnType("jsonb").IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.ChangedAtUtc);
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AssemblyReminderOccurrenceConfiguration : IEntityTypeConfiguration<AssemblyReminderOccurrence>
{
    public void Configure(EntityTypeBuilder<AssemblyReminderOccurrence> builder)
    {
        builder.ToTable("assembly_reminder_occurrences");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasMaxLength(32).IsRequired();
        builder.Property(x => x.ChannelsJson).HasMaxLength(1024).IsRequired();
        builder.Property(x => x.CancelReason).HasMaxLength(512);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => new { x.AssemblyId, x.Status, x.FireAtUtc });
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<ReminderRule>().WithMany().HasForeignKey(x => x.ReminderRuleId).OnDelete(DeleteBehavior.SetNull);
    }
}
