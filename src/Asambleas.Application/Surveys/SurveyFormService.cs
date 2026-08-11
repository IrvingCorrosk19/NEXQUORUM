namespace Asambleas.Application.Surveys;

using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Surveys;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Domain.Voting;
using Microsoft.EntityFrameworkCore;

public sealed class SurveyFormService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;

    public SurveyFormService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
    }

    public async Task<IReadOnlyList<SurveyFormDto>> ListAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        await EnsureAssemblyAsync(assemblyId, cancellationToken);
        var forms = await _db.SurveyForms
            .AsNoTracking()
            .Where(f => f.AssemblyId == assemblyId)
            .OrderByDescending(f => f.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var result = new List<SurveyFormDto>();
        foreach (var form in forms)
        {
            result.Add(await ToDtoAsync(form, includeAnswers: false, cancellationToken));
        }

        return result;
    }

    public async Task<SurveyFormDto> GetAsync(
        Guid assemblyId,
        Guid formId,
        CancellationToken cancellationToken = default)
    {
        await EnsureAssemblyAsync(assemblyId, cancellationToken);
        var form = await LoadFormAsync(assemblyId, formId, cancellationToken);
        return await ToDtoAsync(form, includeAnswers: false, cancellationToken);
    }

    public async Task<SurveyFormDto> CreateAsync(
        Guid assemblyId,
        CreateSurveyFormRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        ArgumentNullException.ThrowIfNull(request);

        var assembly = await EnsureAssemblyAsync(assemblyId, cancellationToken);
        var title = Require(request.Title, "Title", 512);

        if (request.AgendaItemId is Guid agendaId)
        {
            await EnsureAgendaAsync(assemblyId, agendaId, cancellationToken);
        }

        var form = new SurveyForm
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            AgendaItemId = request.AgendaItemId,
            Title = title,
            Description = Truncate(request.Description, 4000),
            Status = VotingDesignCodes.DesignStatus.Draft,
            CreatedByUserId = _currentTenant.UserId
        };

        _db.SurveyForms.Add(form);
        await _db.SaveChangesAsync(cancellationToken);

        await ReplaceQuestionsAsync(form, request.Questions, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.FormCreated,
            assemblyId,
            metadata: new { form.Id, form.Title },
            cancellationToken: cancellationToken);

        return await ToDtoAsync(form, includeAnswers: false, cancellationToken);
    }

    public async Task<SurveyFormDto> UpdateAsync(
        Guid assemblyId,
        Guid formId,
        UpdateSurveyFormRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        ArgumentNullException.ThrowIfNull(request);

        var form = await LoadFormTrackedAsync(assemblyId, formId, cancellationToken);
        EnsureDraft(form);

        if (request.Title is not null)
        {
            form.Title = Require(request.Title, "Title", 512);
        }

        if (request.Description is not null)
        {
            form.Description = Truncate(request.Description, 4000);
        }

        if (request.AgendaItemId.HasValue)
        {
            if (request.AgendaItemId.Value != Guid.Empty)
            {
                await EnsureAgendaAsync(assemblyId, request.AgendaItemId.Value, cancellationToken);
            }

            form.AgendaItemId = request.AgendaItemId.Value == Guid.Empty ? null : request.AgendaItemId;
        }

        if (request.Questions is not null)
        {
            await ReplaceQuestionsAsync(form, request.Questions, cancellationToken);
        }

        form.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return await ToDtoAsync(form, includeAnswers: false, cancellationToken);
    }

    public async Task<SurveyFormDto> PublishAsync(
        Guid assemblyId,
        Guid formId,
        CancellationToken cancellationToken = default)
    {
        var form = await LoadFormTrackedAsync(assemblyId, formId, cancellationToken);
        EnsureDraft(form);

        var questions = await _db.SurveyQuestions
            .Where(q => q.SurveyFormId == formId)
            .OrderBy(q => q.Ordinal)
            .ToListAsync(cancellationToken);

        if (questions.Count == 0)
        {
            throw new DomainException("Cannot publish a survey without questions.");
        }

        foreach (var q in questions)
        {
            ValidateQuestion(q);
        }

        form.Status = "Published";
        form.PublishedAtUtc = DateTimeOffset.UtcNow;
        form.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.FormPublished,
            assemblyId,
            metadata: new { form.Id, form.Title },
            cancellationToken: cancellationToken);

        return await ToDtoAsync(form, includeAnswers: false, cancellationToken);
    }

    public async Task<SurveyFormDto> CloseAsync(
        Guid assemblyId,
        Guid formId,
        CancellationToken cancellationToken = default)
    {
        var form = await LoadFormTrackedAsync(assemblyId, formId, cancellationToken);
        if (form.Status != "Published")
        {
            throw new DomainException("Only published surveys can be closed.");
        }

        form.Status = "Closed";
        form.ClosedAtUtc = DateTimeOffset.UtcNow;
        form.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            AuditEventType.FormClosed,
            assemblyId,
            metadata: new { form.Id },
            cancellationToken: cancellationToken);

        return await ToDtoAsync(form, includeAnswers: false, cancellationToken);
    }

    public async Task<SurveyResponseDto> SubmitAsync(
        Guid assemblyId,
        Guid formId,
        SubmitSurveyResponseRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        ArgumentNullException.ThrowIfNull(request);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var form = await LoadFormTrackedAsync(assemblyId, formId, cancellationToken);
        if (form.Status != "Published")
        {
            throw new DomainException("Survey is not open for responses.");
        }

        if (string.IsNullOrWhiteSpace(request.AnswersJson))
        {
            throw new DomainException("AnswersJson is required.");
        }

        try
        {
            using var _ = JsonDocument.Parse(request.AnswersJson);
        }
        catch (JsonException)
        {
            throw new DomainException("AnswersJson must be valid JSON.");
        }

        var clientRequestId = string.IsNullOrWhiteSpace(request.ClientRequestId)
            ? null
            : request.ClientRequestId.Trim();

        if (clientRequestId is not null)
        {
            var byKey = await _db.SurveyResponses
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    r => r.SurveyFormId == formId && r.ClientRequestId == clientRequestId,
                    cancellationToken);
            if (byKey is not null)
            {
                if (byKey.UserId != userId)
                {
                    throw new DomainException("Client request id is already bound to another respondent.");
                }

                return new SurveyResponseDto(byKey.Id, byKey.SurveyFormId, byKey.UserId, byKey.AnswersJson, byKey.SubmittedAtUtc);
            }
        }

        var existing = await _db.SurveyResponses
            .FirstOrDefaultAsync(r => r.SurveyFormId == formId && r.UserId == userId, cancellationToken);
        if (existing is not null)
        {
            existing.AnswersJson = request.AnswersJson;
            existing.SubmittedAtUtc = DateTimeOffset.UtcNow;
            existing.ClientRequestId ??= clientRequestId;
            await _db.SaveChangesAsync(cancellationToken);
            return new SurveyResponseDto(existing.Id, existing.SurveyFormId, existing.UserId, existing.AnswersJson, existing.SubmittedAtUtc);
        }

        var response = new SurveyResponse
        {
            TenantId = form.TenantId,
            AssemblyId = assemblyId,
            SurveyFormId = formId,
            UserId = userId,
            AnswersJson = request.AnswersJson,
            SubmittedAtUtc = DateTimeOffset.UtcNow,
            ClientRequestId = clientRequestId
        };

        _db.SurveyResponses.Add(response);
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            var winner = await _db.SurveyResponses
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.SurveyFormId == formId && r.UserId == userId, cancellationToken)
                ?? throw new DomainException("Could not confirm survey response after concurrent submit.");
            return new SurveyResponseDto(winner.Id, winner.SurveyFormId, winner.UserId, winner.AnswersJson, winner.SubmittedAtUtc);
        }

        await _audit.WriteAsync(
            AuditEventType.FormResponseSubmitted,
            assemblyId,
            metadata: new { formId, response.Id },
            cancellationToken: cancellationToken);

        return new SurveyResponseDto(response.Id, response.SurveyFormId, response.UserId, response.AnswersJson, response.SubmittedAtUtc);
    }

    public async Task<SurveyResultsDto> GetResultsAsync(
        Guid assemblyId,
        Guid formId,
        CancellationToken cancellationToken = default)
    {
        await EnsureAssemblyAsync(assemblyId, cancellationToken);
        var form = await LoadFormAsync(assemblyId, formId, cancellationToken);

        var questions = await _db.SurveyQuestions
            .AsNoTracking()
            .Where(q => q.SurveyFormId == formId)
            .OrderBy(q => q.Ordinal)
            .ToListAsync(cancellationToken);

        var responses = await _db.SurveyResponses
            .AsNoTracking()
            .Where(r => r.SurveyFormId == formId)
            .ToListAsync(cancellationToken);

        var questionResults = new List<SurveyQuestionResultDto>();
        foreach (var q in questions)
        {
            questionResults.Add(BuildQuestionResult(q, responses));
        }

        return new SurveyResultsDto(form.Id, form.Title, form.Status, responses.Count, questionResults);
    }

    private static SurveyQuestionResultDto BuildQuestionResult(
        SurveyQuestion question,
        IReadOnlyList<SurveyResponse> responses)
    {
        var options = ParseOptions(question.OptionsJson);
        var counts = options.ToDictionary(o => o, _ => 0, StringComparer.OrdinalIgnoreCase);
        var open = new List<string>();

        foreach (var response in responses)
        {
            if (!TryGetAnswer(response.AnswersJson, question.Id, out var answer))
            {
                continue;
            }

            if (question.QuestionType is VotingDesignCodes.Ballot.OpenText)
            {
                if (!string.IsNullOrWhiteSpace(answer))
                {
                    open.Add(answer.Trim());
                }

                continue;
            }

            if (question.QuestionType is VotingDesignCodes.Ballot.MultipleChoice)
            {
                try
                {
                    var selected = JsonSerializer.Deserialize<List<string>>(answer) ?? [];
                    foreach (var s in selected)
                    {
                        if (counts.ContainsKey(s))
                        {
                            counts[s]++;
                        }
                    }
                }
                catch (JsonException)
                {
                    /* ignore malformed */
                }

                continue;
            }

            if (counts.ContainsKey(answer))
            {
                counts[answer]++;
            }
            else if (question.QuestionType is VotingDesignCodes.Ballot.Scale
                     && int.TryParse(answer, out _))
            {
                if (!counts.ContainsKey(answer))
                {
                    counts[answer] = 0;
                }

                counts[answer]++;
            }
        }

        var total = Math.Max(1, responses.Count);
        var dist = counts
            .OrderBy(kv => kv.Key)
            .Select(kv => new SurveyOptionStatDto(
                kv.Key,
                kv.Value,
                Math.Round(100m * kv.Value / total, 2, MidpointRounding.AwayFromZero)))
            .ToList();

        return new SurveyQuestionResultDto(
            question.Id,
            question.Title,
            question.QuestionType,
            dist,
            open.Count > 0 ? open : null);
    }

    private static bool TryGetAnswer(string answersJson, Guid questionId, out string answer)
    {
        answer = string.Empty;
        try
        {
            using var doc = JsonDocument.Parse(answersJson);
            var key = questionId.ToString();
            if (!doc.RootElement.TryGetProperty(key, out var el)
                && !doc.RootElement.TryGetProperty(questionId.ToString("D"), out el))
            {
                return false;
            }

            answer = el.ValueKind switch
            {
                JsonValueKind.String => el.GetString() ?? string.Empty,
                JsonValueKind.Number => el.GetRawText(),
                JsonValueKind.Array => el.GetRawText(),
                _ => el.GetRawText()
            };
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private async Task ReplaceQuestionsAsync(
        SurveyForm form,
        IReadOnlyList<SurveyQuestionInput>? inputs,
        CancellationToken cancellationToken)
    {
        var existing = await _db.SurveyQuestions
            .Where(q => q.SurveyFormId == form.Id)
            .ToListAsync(cancellationToken);
        _db.SurveyQuestions.RemoveRange(existing);

        if (inputs is null || inputs.Count == 0)
        {
            return;
        }

        var ordinal = 1;
        foreach (var input in inputs)
        {
            var q = new SurveyQuestion
            {
                TenantId = form.TenantId,
                SurveyFormId = form.Id,
                Ordinal = input.Ordinal ?? ordinal,
                QuestionType = NormalizeType(input.QuestionType),
                Title = Require(input.Title, "Question title", 512),
                Description = Truncate(input.Description, 2000),
                OptionsJson = input.OptionsJson,
                IsRequired = input.IsRequired
            };
            ValidateQuestion(q);
            _db.SurveyQuestions.Add(q);
            ordinal++;
        }
    }

    private static void ValidateQuestion(SurveyQuestion q)
    {
        if (q.QuestionType is VotingDesignCodes.Ballot.SingleChoice
            or VotingDesignCodes.Ballot.MultipleChoice)
        {
            var options = ParseOptions(q.OptionsJson);
            if (options.Count < 2)
            {
                throw new DomainException($"Question '{q.Title}' requires at least two options.");
            }
        }
    }

    private static string NormalizeType(string? type)
    {
        var t = (type ?? VotingDesignCodes.Ballot.SingleChoice).Trim();
        return t switch
        {
            var x when x.Equals(VotingDesignCodes.Ballot.SingleChoice, StringComparison.OrdinalIgnoreCase) => VotingDesignCodes.Ballot.SingleChoice,
            var x when x.Equals(VotingDesignCodes.Ballot.MultipleChoice, StringComparison.OrdinalIgnoreCase) => VotingDesignCodes.Ballot.MultipleChoice,
            var x when x.Equals(VotingDesignCodes.Ballot.Scale, StringComparison.OrdinalIgnoreCase) => VotingDesignCodes.Ballot.Scale,
            var x when x.Equals(VotingDesignCodes.Ballot.OpenText, StringComparison.OrdinalIgnoreCase) => VotingDesignCodes.Ballot.OpenText,
            _ => throw new DomainException($"Unsupported survey question type '{type}'.")
        };
    }

    private static List<string> ParseOptions(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json)?
                       .Where(s => !string.IsNullOrWhiteSpace(s))
                       .Select(s => s.Trim())
                       .ToList()
                   ?? [];
        }
        catch (JsonException)
        {
            throw new DomainException("OptionsJson must be a JSON array of strings.");
        }
    }

    private async Task<SurveyFormDto> ToDtoAsync(
        SurveyForm form,
        bool includeAnswers,
        CancellationToken cancellationToken)
    {
        _ = includeAnswers;
        var questions = await _db.SurveyQuestions
            .AsNoTracking()
            .Where(q => q.SurveyFormId == form.Id)
            .OrderBy(q => q.Ordinal)
            .Select(q => new SurveyQuestionDto(
                q.Id,
                q.Ordinal,
                q.QuestionType,
                q.Title,
                q.Description,
                q.OptionsJson,
                q.IsRequired))
            .ToListAsync(cancellationToken);

        var count = await _db.SurveyResponses.CountAsync(r => r.SurveyFormId == form.Id, cancellationToken);

        return new SurveyFormDto(
            form.Id,
            form.AssemblyId,
            form.AgendaItemId,
            form.Title,
            form.Description,
            form.Status,
            form.PublishedAtUtc,
            form.ClosedAtUtc,
            questions,
            count);
    }

    private async Task<Domain.Entities.Assembly> EnsureAssemblyAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        return assembly;
    }

    private async Task EnsureAgendaAsync(Guid assemblyId, Guid agendaItemId, CancellationToken cancellationToken)
    {
        var item = await _db.AgendaItems
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == agendaItemId && i.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Agenda item '{agendaItemId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, item.TenantId);
    }

    private async Task<SurveyForm> LoadFormAsync(Guid assemblyId, Guid formId, CancellationToken cancellationToken)
    {
        var form = await _db.SurveyForms
            .AsNoTracking()
            .FirstOrDefaultAsync(f => f.Id == formId && f.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Survey '{formId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, form.TenantId);
        return form;
    }

    private async Task<SurveyForm> LoadFormTrackedAsync(Guid assemblyId, Guid formId, CancellationToken cancellationToken)
    {
        await EnsureAssemblyAsync(assemblyId, cancellationToken);
        var form = await _db.SurveyForms
            .FirstOrDefaultAsync(f => f.Id == formId && f.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException($"Survey '{formId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, form.TenantId);
        return form;
    }

    private static void EnsureDraft(SurveyForm form)
    {
        if (form.Status is not (VotingDesignCodes.DesignStatus.Draft or "Draft"))
        {
            throw new DomainException("Only draft surveys can be edited.");
        }
    }

    private static string Require(string? value, string field, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new DomainException($"{field} is required.");
        }

        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : throw new DomainException($"{field} exceeds maximum length.");
    }

    private static string? Truncate(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
