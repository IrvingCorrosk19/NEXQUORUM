namespace Asambleas.Infrastructure.Persistence.Configurations;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

internal sealed class VotingSessionConfiguration : IEntityTypeConfiguration<VotingSession>
{
    public void Configure(EntityTypeBuilder<VotingSession> builder)
    {
        builder.ToTable("voting_sessions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.ResultVisibilityPolicy).HasMaxLength(32).IsRequired();
        builder.Property(x => x.EligibleCoefficient).HasPrecision(7, 4);
        builder.Property(x => x.AppliedDecisionRule).HasMaxLength(64);
        builder.Property(x => x.DecisionStatus).HasMaxLength(32);
        builder.Property(x => x.RequiredThresholdPercent).HasPrecision(7, 4);
        builder.Property(x => x.CalculationMethod).HasMaxLength(32).IsRequired();
        builder.Property(x => x.BallotKind).HasMaxLength(32).IsRequired();
        builder.Property(x => x.RuleSnapshotJson).HasColumnType("jsonb");
        builder.Property(x => x.CancellationReason).HasMaxLength(2000);
        builder.Property(x => x.VersionNumber).HasDefaultValue(1);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.MotionId);
        builder.HasIndex(x => x.Status);
        // At most one Open session per assembly (DB-level concurrency guard).
        builder.HasIndex(x => x.AssemblyId)
            .IsUnique()
            .HasFilter("\"Status\" = 'Open'")
            .HasDatabaseName("IX_voting_sessions_AssemblyId_Open");
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Motion>().WithMany().HasForeignKey(x => x.MotionId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class VotingEligibilitySnapshotConfiguration : IEntityTypeConfiguration<VotingEligibilitySnapshot>
{
    public void Configure(EntityTypeBuilder<VotingEligibilitySnapshot> builder)
    {
        builder.ToTable("voting_eligibility_snapshots");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.CoefficientPercent).HasPrecision(7, 4);
        builder.Property(x => x.UnitCode).HasMaxLength(64);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.VotingSessionId);
        builder.HasIndex(x => new { x.VotingSessionId, x.UserId }).IsUnique();
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<VotingSession>().WithMany().HasForeignKey(x => x.VotingSessionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class VoteConfiguration : IEntityTypeConfiguration<Vote>
{
    public void Configure(EntityTypeBuilder<Vote> builder)
    {
        builder.ToTable("votes");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Choice).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.CoefficientPercent).HasPrecision(7, 4);
        builder.Property(x => x.ClientRequestId).HasMaxLength(128);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => x.VotingSessionId);
        builder.HasIndex(x => new { x.VotingSessionId, x.UserId }).IsUnique();
        builder.HasIndex(x => new { x.VotingSessionId, x.ClientRequestId })
            .IsUnique()
            .HasFilter("\"ClientRequestId\" IS NOT NULL");
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<VotingSession>().WithMany().HasForeignKey(x => x.VotingSessionId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Unit>().WithMany().HasForeignKey(x => x.UnitId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class QuorumSnapshotConfiguration : IEntityTypeConfiguration<QuorumSnapshot>
{
    public void Configure(EntityTypeBuilder<QuorumSnapshot> builder)
    {
        builder.ToTable("quorum_snapshots");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.PresentCoefficient).HasPrecision(7, 4);
        builder.Property(x => x.RequiredCoefficient).HasPrecision(7, 4);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Reason).HasMaxLength(64);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.Status);
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class SpeakerRequestConfiguration : IEntityTypeConfiguration<SpeakerRequest>
{
    public void Configure(EntityTypeBuilder<SpeakerRequest> builder)
    {
        builder.ToTable("speaker_requests");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => x.Status);
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AuditEventConfiguration : IEntityTypeConfiguration<AuditEvent>
{
    public void Configure(EntityTypeBuilder<AuditEvent> builder)
    {
        builder.ToTable("audit_events");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.EventType).HasMaxLength(128).IsRequired();
        builder.Property(x => x.MetadataJson).HasColumnType("jsonb").IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => x.EventType);
        builder.HasIndex(x => x.OccurredAtUtc);
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Restrict);
    }
}
