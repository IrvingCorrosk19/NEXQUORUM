namespace Asambleas.Contracts.Surveys;

public sealed record SurveyQuestionDto(
    Guid Id,
    int Ordinal,
    string QuestionType,
    string Title,
    string? Description,
    string? OptionsJson,
    bool IsRequired);

public sealed record SurveyFormDto(
    Guid Id,
    Guid AssemblyId,
    Guid? AgendaItemId,
    string Title,
    string? Description,
    string Status,
    DateTimeOffset? PublishedAtUtc,
    DateTimeOffset? ClosedAtUtc,
    IReadOnlyList<SurveyQuestionDto> Questions,
    int ResponseCount = 0);

public sealed record SurveyQuestionInput(
    string QuestionType,
    string Title,
    string? Description,
    string? OptionsJson,
    bool IsRequired = true,
    int? Ordinal = null);

public sealed record CreateSurveyFormRequest(
    string Title,
    string? Description,
    Guid? AgendaItemId,
    IReadOnlyList<SurveyQuestionInput>? Questions);

public sealed record UpdateSurveyFormRequest(
    string? Title,
    string? Description,
    Guid? AgendaItemId,
    IReadOnlyList<SurveyQuestionInput>? Questions);

public sealed record SubmitSurveyResponseRequest(
    string AnswersJson,
    string? ClientRequestId = null);

public sealed record SurveyResponseDto(
    Guid Id,
    Guid SurveyFormId,
    Guid UserId,
    string AnswersJson,
    DateTimeOffset SubmittedAtUtc);

public sealed record SurveyResultsDto(
    Guid SurveyFormId,
    string Title,
    string Status,
    int ResponseCount,
    IReadOnlyList<SurveyQuestionResultDto> Questions);

public sealed record SurveyQuestionResultDto(
    Guid QuestionId,
    string Title,
    string QuestionType,
    IReadOnlyList<SurveyOptionStatDto> Distribution,
    IReadOnlyList<string>? OpenTextAnswers);

public sealed record SurveyOptionStatDto(
    string Label,
    int Count,
    decimal Percent);

