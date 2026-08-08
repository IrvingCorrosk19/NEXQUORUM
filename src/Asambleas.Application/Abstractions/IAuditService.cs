namespace Asambleas.Application.Abstractions;

public interface IAuditService
{
    Task WriteAsync(
        string eventType,
        Guid? assemblyId = null,
        Guid? correlationId = null,
        object? metadata = null,
        CancellationToken cancellationToken = default);
}
