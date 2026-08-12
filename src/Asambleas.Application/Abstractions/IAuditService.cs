namespace Asambleas.Application.Abstractions;

public interface IAuditService
{
    Task WriteAsync(
        string eventType,
        Guid? assemblyId = null,
        Guid? correlationId = null,
        object? metadata = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Writes an audit event with an explicit tenant (anonymous flows such as invitation activation).
    /// </summary>
    Task WriteSystemAsync(
        Guid tenantId,
        string eventType,
        Guid? propertyHorizontalId = null,
        Guid? correlationId = null,
        Guid? userId = null,
        object? metadata = null,
        CancellationToken cancellationToken = default);
}
