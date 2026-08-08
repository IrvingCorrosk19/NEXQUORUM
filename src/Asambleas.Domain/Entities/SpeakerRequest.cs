namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class SpeakerRequest : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid UserId { get; set; }

    public string DisplayName { get; set; } = string.Empty;

    public SpeakerRequestStatus Status { get; set; } = SpeakerRequestStatus.Requested;

    public DateTimeOffset RequestedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? GrantedAtUtc { get; set; }

    public DateTimeOffset? CompletedAtUtc { get; set; }

    public int QueueOrder { get; set; }
}
