namespace Asambleas.Application.Abstractions;

public interface ICurrentTenant
{
    Guid TenantId { get; }

    Guid? OrganizationId { get; }

    Guid? PropertyHorizontalId { get; }

    Guid? UserId { get; }

    bool IsAuthenticated { get; }
}
