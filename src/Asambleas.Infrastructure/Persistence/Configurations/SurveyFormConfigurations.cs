namespace Asambleas.Infrastructure.Persistence.Configurations;

using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

internal sealed class SurveyFormConfiguration : IEntityTypeConfiguration<SurveyForm>
{
    public void Configure(EntityTypeBuilder<SurveyForm> builder)
    {
        builder.ToTable("survey_forms");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Title).HasMaxLength(512).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(4000);
        builder.Property(x => x.Status).HasMaxLength(32).IsRequired();
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.Status);
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<AgendaItem>().WithMany().HasForeignKey(x => x.AgendaItemId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class SurveyQuestionConfiguration : IEntityTypeConfiguration<SurveyQuestion>
{
    public void Configure(EntityTypeBuilder<SurveyQuestion> builder)
    {
        builder.ToTable("survey_questions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.QuestionType).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Title).HasMaxLength(512).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(2000);
        builder.Property(x => x.OptionsJson).HasColumnType("jsonb");
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.SurveyFormId);
        builder.HasIndex(x => new { x.SurveyFormId, x.Ordinal });
        builder.HasOne<SurveyForm>().WithMany().HasForeignKey(x => x.SurveyFormId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class SurveyResponseConfiguration : IEntityTypeConfiguration<SurveyResponse>
{
    public void Configure(EntityTypeBuilder<SurveyResponse> builder)
    {
        builder.ToTable("survey_responses");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.AnswersJson).HasColumnType("jsonb").IsRequired();
        builder.Property(x => x.ClientRequestId).HasMaxLength(128);
        builder.HasIndex(x => x.TenantId);
        builder.HasIndex(x => x.AssemblyId);
        builder.HasIndex(x => x.SurveyFormId);
        builder.HasIndex(x => new { x.SurveyFormId, x.UserId }).IsUnique();
        builder.HasIndex(x => new { x.SurveyFormId, x.ClientRequestId })
            .IsUnique()
            .HasFilter("\"ClientRequestId\" IS NOT NULL");
        builder.HasOne<AssemblyEntity>().WithMany().HasForeignKey(x => x.AssemblyId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<SurveyForm>().WithMany().HasForeignKey(x => x.SurveyFormId).OnDelete(DeleteBehavior.Cascade);
    }
}
