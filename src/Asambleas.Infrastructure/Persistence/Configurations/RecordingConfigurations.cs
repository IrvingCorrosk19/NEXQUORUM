namespace Asambleas.Infrastructure.Persistence.Configurations;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

internal sealed class AssemblyRecordingConfiguration : IEntityTypeConfiguration<AssemblyRecording>
{
    public void Configure(EntityTypeBuilder<AssemblyRecording> builder)
    {
        builder.ToTable("assembly_recordings");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.MimeType).HasMaxLength(128);
        builder.Property(x => x.StorageKey).HasMaxLength(512);
        builder.Property(x => x.ChecksumSha256).HasMaxLength(64);
        builder.Property(x => x.ProviderEgressId).HasMaxLength(128);
        builder.Property(x => x.Provider).HasMaxLength(64).IsRequired();
        builder.Property(x => x.FailureReason).HasMaxLength(2000);
        builder.Property(x => x.DisplayFileName).HasMaxLength(256);
        builder.Property(x => x.RoomName).HasMaxLength(128).IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.StorageKey);
        // At most one in-flight recording per assembly (Starting/Recording/Processing).
        builder.HasIndex(x => x.AssemblyId)
            .IsUnique()
            .HasFilter(
                "\"Status\" IN ('Starting', 'Recording', 'Processing')")
            .HasDatabaseName("IX_assembly_recordings_AssemblyId_Active");
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class PropertyRecordingPolicyConfiguration : IEntityTypeConfiguration<PropertyRecordingPolicy>
{
    public void Configure(EntityTypeBuilder<PropertyRecordingPolicy> builder)
    {
        builder.ToTable("property_recording_policies");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Mode).HasConversion<string>().HasMaxLength(64);
        builder.Property(x => x.DownloadVisibility).HasConversion<string>().HasMaxLength(64);
        builder.Property(x => x.NoticeText).HasMaxLength(4000).IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.PropertyHorizontalId).IsUnique();
        builder.HasOne<PropertyHorizontal>()
            .WithMany()
            .HasForeignKey(x => x.PropertyHorizontalId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class RecordingNoticeAcceptanceConfiguration : IEntityTypeConfiguration<RecordingNoticeAcceptance>
{
    public void Configure(EntityTypeBuilder<RecordingNoticeAcceptance> builder)
    {
        builder.ToTable("recording_notice_acceptances");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.NoticeVersion).HasMaxLength(64).IsRequired();
        builder.Property(x => x.ClientUserAgent).HasMaxLength(512);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => new { x.AssemblyId, x.UserId, x.NoticeVersion }).IsUnique();
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
    }
}
