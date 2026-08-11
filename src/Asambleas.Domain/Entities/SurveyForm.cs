namespace Asambleas.Domain.Entities;

using Asambleas.Domain.Common;
using Asambleas.Domain.Voting;

/// <summary>
/// Survey / form instrument — does NOT produce a formal Motion decision.
/// </summary>
public class SurveyForm : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid? AgendaItemId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    /// <summary>Draft / Published / Closed / Archived</summary>
    public string Status { get; set; } = VotingDesignCodes.DesignStatus.Draft;

    public DateTimeOffset? PublishedAtUtc { get; set; }

    public DateTimeOffset? ClosedAtUtc { get; set; }

    public Guid? CreatedByUserId { get; set; }
}

public class SurveyQuestion : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid SurveyFormId { get; set; }

    public int Ordinal { get; set; }

    /// <summary>SingleChoice / MultipleChoice / Scale / OpenText</summary>
    public string QuestionType { get; set; } = VotingDesignCodes.Ballot.SingleChoice;

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    /// <summary>JSON options / scale bounds.</summary>
    public string? OptionsJson { get; set; }

    public bool IsRequired { get; set; } = true;
}

public class SurveyResponse : Entity, ITenantScoped
{
    public Guid TenantId { get; set; }

    public Guid AssemblyId { get; set; }

    public Guid SurveyFormId { get; set; }

    public Guid UserId { get; set; }

    /// <summary>JSON map of questionId → answer payload.</summary>
    public string AnswersJson { get; set; } = "{}";

    public DateTimeOffset SubmittedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public string? ClientRequestId { get; set; }
}
