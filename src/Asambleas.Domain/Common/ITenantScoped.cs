namespace Asambleas.Domain.Common;

public interface ITenantScoped
{
    Guid TenantId { get; set; }
}
