namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;

/// <summary>
/// Informal assembly chat. Never becomes a vote, power, accreditation, or legal decision.
/// </summary>
public class AssemblyChatMessage : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid AuthorUserId { get; set; }

    public string AuthorDisplayName { get; set; } = string.Empty;

    /// <summary>System | President | Participant | Announcement</summary>
    public string Kind { get; set; } = "Participant";

    public string Body { get; set; } = string.Empty;

    public bool IsPinned { get; set; }

    public bool IsRemoved { get; set; }

    public Guid? RemovedByUserId { get; set; }

    public DateTimeOffset? RemovedAtUtc { get; set; }
}
