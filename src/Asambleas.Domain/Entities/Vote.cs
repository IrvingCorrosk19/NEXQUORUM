namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;

public class Vote : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid VotingSessionId { get; set; }

    public Guid UserId { get; set; }

    public Guid? UnitId { get; set; }

    public VoteChoice Choice { get; set; }

    /// <summary>Server-authoritative coefficient snapshot at cast time (decimal(7,4)).</summary>
    public decimal CoefficientPercent { get; set; }

    public Guid EvidenceId { get; set; } = Guid.NewGuid();

    public DateTimeOffset CastAtUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Optional client idempotency key (unique per session when present).</summary>
    public string? ClientRequestId { get; set; }
}
