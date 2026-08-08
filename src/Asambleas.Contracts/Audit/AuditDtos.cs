namespace Asambleas.Contracts.Audit;

public sealed record AuditEventDto(
    Guid Id,
    Guid TenantId,
    Guid? OrganizationId,
    Guid? PropertyHorizontalId,
    Guid? AssemblyId,
    Guid? UserId,
    string EventType,
    Guid CorrelationId,
    DateTimeOffset OccurredAtUtc,
    string MetadataJson);

public sealed record AuditEventQuery(
    Guid? AssemblyId,
    string? EventType,
    DateTimeOffset? FromUtc,
    DateTimeOffset? ToUtc,
    int Skip,
    int Take);

public sealed record AuditEventPageDto(
    int Total,
    IReadOnlyList<AuditEventDto> Items);
