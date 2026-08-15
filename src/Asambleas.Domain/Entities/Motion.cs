namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;

public class Motion : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid AgendaItemId { get; set; }

    /// <summary>Questionnaire display order within the assembly (1-based preferred).</summary>
    public int DisplayOrder { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Body { get; set; } = string.Empty;

    public MotionStatus Status { get; set; } = MotionStatus.Draft;

    /// <summary>Studio lifecycle: Draft / Ready / Archived (independent of vote outcome status).</summary>
    public string DesignStatus { get; set; } = VotingDesignCodes.DesignStatus.Draft;

    /// <summary>FormalVote vs Survey design intent (formal votes create decisions).</summary>
    public string InstrumentKind { get; set; } = VotingDesignCodes.Instrument.FormalVote;

    public string BallotKind { get; set; } = VotingDesignCodes.Ballot.FavorAgainstAbstain;

    public string CalculationMethod { get; set; } = VotingDesignCodes.Calculation.Coefficient;

    public string DecisionRuleCode { get; set; } = SimpleMajorityDecisionRule.Code;

    /// <summary>Required % for QualifiedMajority (e.g. 66.6700). Null for simple majority.</summary>
    public decimal? RequiredThresholdPercent { get; set; }

    public string DefaultResultVisibilityPolicy { get; set; } = ResultVisibility.HiddenUntilClose;

    /// <summary>JSON array of option labels for SingleChoice / MultiCandidate ballots.</summary>
    public string? OptionsJson { get; set; }

    public string? Instructions { get; set; }

    /// <summary>Primary question shown to voters (falls back to Title).</summary>
    public string? QuestionText { get; set; }

    public bool IsSecret { get; set; }

    public string? TemplateKey { get; set; }

    /// <summary>First motion in the version chain.</summary>
    public Guid? RootMotionId { get; set; }

    public Guid? PreviousMotionId { get; set; }

    public int VersionNumber { get; set; } = 1;

    /// <summary>Optimistic concurrency token.</summary>
    public Guid ConcurrencyStamp { get; set; } = Guid.NewGuid();
}
