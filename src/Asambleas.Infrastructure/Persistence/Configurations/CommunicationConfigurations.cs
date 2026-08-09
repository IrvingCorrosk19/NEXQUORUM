namespace Asambleas.Infrastructure.Persistence.Configurations;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

internal sealed class CommunicationProfileConfiguration : IEntityTypeConfiguration<CommunicationProfile>
{
    public void Configure(EntityTypeBuilder<CommunicationProfile> builder)
    {
        builder.ToTable("communication_profiles");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.TestRecipientOverride).HasMaxLength(320);
        builder.Property(x => x.DefaultTimezoneId).HasMaxLength(64).IsRequired();
        builder.Property(x => x.DefaultFromDisplayName).HasMaxLength(256);
        builder.Property(x => x.DefaultReplyTo).HasMaxLength(320);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => new { x.TenantId, x.PropertyHorizontalId }).IsUnique();
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ChannelConfigurationConfiguration : IEntityTypeConfiguration<ChannelConfiguration>
{
    public void Configure(EntityTypeBuilder<ChannelConfiguration> builder)
    {
        builder.ToTable("channel_configurations");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Channel).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.ProviderType).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.SettingsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.SecretCiphertext).HasColumnType("text");
        builder.Property(x => x.LastTestDetail).HasMaxLength(1024);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => new { x.TenantId, x.PropertyHorizontalId, x.Channel }).IsUnique();
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class MessageTemplateConfiguration : IEntityTypeConfiguration<MessageTemplate>
{
    public void Configure(EntityTypeBuilder<MessageTemplate> builder)
    {
        builder.ToTable("message_templates");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Code).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(256).IsRequired();
        builder.Property(x => x.ChannelScope).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Subject).HasMaxLength(512);
        builder.Property(x => x.BodyHtml).HasColumnType("text").IsRequired();
        builder.Property(x => x.BodyText).HasColumnType("text").IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => new { x.TenantId, x.PropertyHorizontalId, x.Code }).IsUnique();
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ConvocationConfiguration : IEntityTypeConfiguration<Convocation>
{
    public void Configure(EntityTypeBuilder<Convocation> builder)
    {
        builder.ToTable("convocations");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Title).HasMaxLength(512).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.ChannelsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.Subject).HasMaxLength(512).IsRequired();
        builder.Property(x => x.BodyHtml).HasColumnType("text").IsRequired();
        builder.Property(x => x.BodyText).HasColumnType("text").IsRequired();
        builder.Property(x => x.IdempotencyKey).HasMaxLength(128);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique().HasFilter("\"IdempotencyKey\" IS NOT NULL");
        builder.HasOne<Assembly>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ConvocationRecipientConfiguration : IEntityTypeConfiguration<ConvocationRecipient>
{
    public void Configure(EntityTypeBuilder<ConvocationRecipient> builder)
    {
        builder.ToTable("convocation_recipients");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.DisplayName).HasMaxLength(256).IsRequired();
        builder.Property(x => x.Email).HasMaxLength(320);
        builder.Property(x => x.PhoneE164).HasMaxLength(32);
        builder.Property(x => x.ChannelsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.ValidationIssuesJson).HasColumnType("jsonb");
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.ConvocationId);
        builder.HasIndex(x => new { x.ConvocationId, x.OwnerId }).IsUnique().HasFilter("\"OwnerId\" IS NOT NULL");
        builder.HasOne<Convocation>().WithMany().HasForeignKey(x => x.ConvocationId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class CommunicationBatchConfiguration : IEntityTypeConfiguration<CommunicationBatch>
{
    public void Configure(EntityTypeBuilder<CommunicationBatch> builder)
    {
        builder.ToTable("communication_batches");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.IdempotencyKey).HasMaxLength(128).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.ConvocationId);
        builder.HasIndex(x => new { x.TenantId, x.IdempotencyKey }).IsUnique();
        builder.HasOne<Convocation>().WithMany().HasForeignKey(x => x.ConvocationId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CommunicationDeliveryConfiguration : IEntityTypeConfiguration<CommunicationDelivery>
{
    public void Configure(EntityTypeBuilder<CommunicationDelivery> builder)
    {
        builder.ToTable("communication_deliveries");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Channel).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.ProviderType).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Destination).HasMaxLength(320);
        builder.Property(x => x.ProviderMessageId).HasMaxLength(256);
        builder.Property(x => x.ErrorDetail).HasMaxLength(2048);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.BatchId);
        builder.HasIndex(x => x.ConvocationId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => new { x.BatchId, x.RecipientId, x.Channel }).IsUnique();
        builder.HasOne<CommunicationBatch>().WithMany().HasForeignKey(x => x.BatchId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<ConvocationRecipient>().WithMany().HasForeignKey(x => x.RecipientId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CommunicationDeliveryEventConfiguration : IEntityTypeConfiguration<CommunicationDeliveryEvent>
{
    public void Configure(EntityTypeBuilder<CommunicationDeliveryEvent> builder)
    {
        builder.ToTable("communication_delivery_events");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.EventType).HasMaxLength(64).IsRequired();
        builder.Property(x => x.Detail).HasMaxLength(2048);
        builder.Property(x => x.ProviderPayloadJson).HasColumnType("jsonb");
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.DeliveryId);
        builder.HasOne<CommunicationDelivery>().WithMany().HasForeignKey(x => x.DeliveryId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class PortalNotificationConfiguration : IEntityTypeConfiguration<PortalNotification>
{
    public void Configure(EntityTypeBuilder<PortalNotification> builder)
    {
        builder.ToTable("portal_notifications");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Title).HasMaxLength(256).IsRequired();
        builder.Property(x => x.Body).HasColumnType("text").IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.UserId);
        builder.HasIndex(x => new { x.TenantId, x.UserId, x.IsRead });
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ReminderRuleConfiguration : IEntityTypeConfiguration<ReminderRule>
{
    public void Configure(EntityTypeBuilder<ReminderRule> builder)
    {
        builder.ToTable("reminder_rules");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).HasMaxLength(256).IsRequired();
        builder.Property(x => x.ChannelsJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.ConditionsJson).HasColumnType("jsonb").IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.PropertyHorizontalId);
        builder.HasOne<PropertyHorizontal>().WithMany().HasForeignKey(x => x.PropertyHorizontalId).OnDelete(DeleteBehavior.Restrict);
    }
}
