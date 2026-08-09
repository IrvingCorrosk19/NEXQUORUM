namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class Convocation : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public Guid AssemblyId { get; set; }

    public string Title { get; set; } = string.Empty;

    public ConvocationStatus Status { get; set; } = ConvocationStatus.Draft;

    public int Version { get; set; } = 1;

    /// <summary>JSON array of selected <see cref="CommunicationChannel"/> values.</summary>
    public string ChannelsJson { get; set; } = "[]";

    public Guid? TemplateId { get; set; }

    public string Subject { get; set; } = string.Empty;

    public string BodyHtml { get; set; } = string.Empty;

    public string BodyText { get; set; } = string.Empty;

    public DateTimeOffset? ScheduledAtUtc { get; set; }

    public DateTimeOffset? SentAtUtc { get; set; }

    public Guid CreatedByUserId { get; set; }

    public Guid? ApprovedByUserId { get; set; }

    public string? IdempotencyKey { get; set; }
}
