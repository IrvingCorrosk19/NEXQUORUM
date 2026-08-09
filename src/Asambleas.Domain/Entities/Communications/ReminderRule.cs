namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

public class ReminderRule : Entity, ITenantScoped, IPropertyHorizontalScoped
{
    public Guid TenantId { get; set; }

    public Guid PropertyHorizontalId { get; set; }

    public Guid? ConvocationId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Offset before assembly start, e.g. -48 hours as total hours.</summary>
    public int OffsetHoursBeforeAssembly { get; set; }

    /// <summary>JSON channels to use for this reminder.</summary>
    public string ChannelsJson { get; set; } = "[]";

    /// <summary>Only remind if not confirmed / not read, encoded as JSON conditions.</summary>
    public string ConditionsJson { get; set; } = "{}";

    public bool IsEnabled { get; set; } = true;
}