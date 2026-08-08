namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class Unit : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// Ownership coefficient as a percentage, precision decimal(7,4).
    /// </summary>
    public decimal CoefficientPercent { get; set; }
}
