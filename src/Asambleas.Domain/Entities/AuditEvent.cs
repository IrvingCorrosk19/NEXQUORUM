namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class AuditEvent : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid? OrganizationId { get; set; }

    public Guid? PropertyHorizontalId { get; set; }

    public Guid? AssemblyId { get; set; }

    public Guid? UserId { get; set; }

    public string EventType { get; set; } = string.Empty;

    public Guid CorrelationId { get; set; }

    public DateTimeOffset OccurredAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public string MetadataJson { get; set; } = "{}";
}
