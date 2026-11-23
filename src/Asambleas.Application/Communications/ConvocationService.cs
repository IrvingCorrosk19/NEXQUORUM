namespace Asambleas.Application.Communications;

using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Communications;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

public sealed class ConvocationService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    public const string SendConfirmationPhrase = "ENVIAR CONVOCATORIA";

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAuditService _audit;
    private readonly ICommunicationEnvironment _environment;
    private readonly CommunicationConfigurationService _config;
    private readonly DeliveryDispatchService _dispatch;
    private readonly AssemblyAccessLinkService _accessLinks;
    private readonly IOwnerPortalIdentityService _identity;

    public ConvocationService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        ICommunicationEnvironment environment,
        CommunicationConfigurationService config,
        DeliveryDispatchService dispatch,
        AssemblyAccessLinkService accessLinks,
        IOwnerPortalIdentityService identity)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _environment = environment;
        _config = config;
        _dispatch = dispatch;
        _accessLinks = accessLinks;
        _identity = identity;
    }

    public async Task<IReadOnlyList<ConvocationSummaryDto>> ListForAssemblyAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsureAssemblyAsync(assemblyId, cancellationToken);

        var rows = await _db.Convocations
            .AsNoTracking()
            .Where(c => c.AssemblyId == assemblyId)
            .OrderByDescending(c => c.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var ids = rows.Select(r => r.Id).ToList();
        var recipientStats = await _db.ConvocationRecipients
            .AsNoTracking()
            .Where(r => ids.Contains(r.ConvocationId))
            .GroupBy(r => r.ConvocationId)
            .Select(g => new { ConvocationId = g.Key, Total = g.Count(), Valid = g.Count(x => x.IsValid) })
            .ToListAsync(cancellationToken);
        var deliveryStats = await _db.CommunicationDeliveries
            .AsNoTracking()
            .Where(d => ids.Contains(d.ConvocationId))
            .GroupBy(d => d.ConvocationId)
            .Select(g => new
            {
                ConvocationId = g.Key,
                Pending = g.Count(x => x.Status == DeliveryStatus.Pending || x.Status == DeliveryStatus.Queued),
                Accepted = g.Count(x => x.Status == DeliveryStatus.Sent),
                Confirmed = g.Count(x => x.Status == DeliveryStatus.Delivered || x.Status == DeliveryStatus.Read),
                Failed = g.Count(x => x.Status == DeliveryStatus.Failed
                    || x.Status == DeliveryStatus.Bounced
                    || x.Status == DeliveryStatus.DeadLetter)
            })
            .ToListAsync(cancellationToken);

        return rows.Select(c =>
        {
            var stats = recipientStats.FirstOrDefault(s => s.ConvocationId == c.Id);
            var deliveries = deliveryStats.FirstOrDefault(s => s.ConvocationId == c.Id);
            return new ConvocationSummaryDto(
                c.Id,
                c.AssemblyId,
                c.Title,
                c.Status.ToString(),
                c.Version,
                ParseChannels(c.ChannelsJson).Select(x => x.ToString()).ToList(),
                c.Subject,
                c.ScheduledAtUtc,
                c.SentAtUtc,
                stats?.Total ?? 0,
                stats?.Valid ?? 0,
                deliveries?.Pending ?? 0,
                deliveries?.Accepted ?? 0,
                deliveries?.Confirmed ?? 0,
                deliveries?.Failed ?? 0);
        }).ToList();
    }

    public async Task<ConvocationDetailDto> GetAsync(Guid convocationId, CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var c = await _db.Convocations.FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        var recipients = await _db.ConvocationRecipients
            .AsNoTracking()
            .Where(r => r.ConvocationId == convocationId)
            .OrderBy(r => r.DisplayName)
            .ToListAsync(cancellationToken);

        var preview = await BuildPreviewAsync(c, recipients, cancellationToken);
        var checks = await BuildChecksAsync(c, recipients, cancellationToken);
        return ToDetail(c, recipients, preview, checks);
    }

    public async Task<ConvocationEmailPreviewDto> PreviewEmailAsync(
        Guid convocationId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var c = await _db.Convocations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        var assembly = await _db.Assemblies.AsNoTracking().FirstAsync(a => a.Id == c.AssemblyId, cancellationToken);
        var ph = await _db.PropertyHorizontals.AsNoTracking().FirstAsync(p => p.Id == c.PropertyHorizontalId, cancellationToken);
        var agenda = await _db.AgendaItems.AsNoTracking()
            .Where(i => i.AssemblyId == assembly.Id)
            .OrderBy(i => i.Ordinal)
            .Select(i => new ValueTuple<int, string>(i.Ordinal, i.Title))
            .ToListAsync(cancellationToken);

        var recipient = await _db.ConvocationRecipients.AsNoTracking()
            .Where(r => r.ConvocationId == convocationId)
            .OrderBy(r => r.DisplayName)
            .FirstOrDefaultAsync(cancellationToken);

        string? unitCode = null;
        decimal? coef = null;
        if (recipient?.OwnerId is Guid ownerId)
        {
            var ownership = await (
                from o in _db.Ownerships.AsNoTracking()
                join u in _db.Units.AsNoTracking() on o.UnitId equals u.Id
                where o.OwnerId == ownerId
                      && u.PropertyHorizontalId == c.PropertyHorizontalId
                      && o.IsActive
                orderby u.Code
                select new { u.Code, Coef = u.CoefficientPercent * (o.SharePercent / 100m) })
                .FirstOrDefaultAsync(cancellationToken);
            if (ownership is not null)
            {
                unitCode = ownership.Code;
                coef = ownership.Coef;
            }
        }

        var (profile, _, _, _, _) = await _config.LoadRuntimeAsync(c.PropertyHorizontalId, cancellationToken);
        var composed = ConvocationEmailComposer.Compose(
            new ConvocationEmailComposer.ComposeInput(
                recipient?.DisplayName ?? "Propietario",
                ph.Name,
                assembly.Title,
                assembly.AssemblyKind,
                assembly.ScheduledAtUtc,
                string.IsNullOrWhiteSpace(ph.TimeZoneId) ? "America/Panama" : ph.TimeZoneId,
                assembly.Modality,
                assembly.LocationText,
                unitCode,
                coef,
                agenda,
                "https://asambleas.app/ingresar/vista-previa",
                null,
                profile.SandboxMode,
                string.IsNullOrWhiteSpace(c.Subject) ? null : c.Subject.Trim(),
                DemonstrationLink: true));

        return new ConvocationEmailPreviewDto(composed.Subject, composed.Preheader, composed.Html, composed.Text);
    }

    public async Task<ConvocationDetailDto> CreateAsync(
        CreateConvocationRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await EnsureAssemblyAsync(request.AssemblyId, cancellationToken);

        var title = request.Title?.Trim() ?? string.Empty;
        if (title.Length == 0)
        {
            throw new DomainException("TITLE_REQUIRED", "Indica un título para el borrador.");
        }

        var subject = string.IsNullOrWhiteSpace(request.Subject) ? title : request.Subject.Trim();
        var idempotencyKey = IdempotencyKeyNormalizer.Normalize(request.IdempotencyKey);

        if (idempotencyKey is not null)
        {
            var existing = await _db.Convocations
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    c => c.TenantId == _currentTenant.TenantId && c.IdempotencyKey == idempotencyKey,
                    cancellationToken);
            if (existing is not null)
            {
                return await GetAsync(existing.Id, cancellationToken);
            }
        }

        var channels = ParseChannelNames(request.Channels);
        if (channels.Count == 0)
        {
            throw new DomainException("CHANNELS_REQUIRED", "Selecciona al menos un canal.");
        }

        var entity = new Convocation
        {
            TenantId = _currentTenant.TenantId,
            PropertyHorizontalId = assembly.PropertyHorizontalId,
            AssemblyId = assembly.Id,
            Title = title,
            Subject = subject,
            BodyHtml = request.BodyHtml ?? string.Empty,
            BodyText = request.BodyText ?? string.Empty,
            ChannelsJson = JsonSerializer.Serialize(channels.Select(c => c.ToString()), JsonOptions),
            TemplateId = request.TemplateId,
            CreatedByUserId = TenantGuard.RequireUserId(_currentTenant),
            IdempotencyKey = idempotencyKey,
            Status = ConvocationStatus.Draft
        };

        if (request.TemplateId is Guid templateId)
        {
            var template = await _db.MessageTemplates
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == templateId && t.PropertyHorizontalId == assembly.PropertyHorizontalId, cancellationToken);
            if (template is not null)
            {
                entity.Subject = string.IsNullOrWhiteSpace(entity.Subject) ? (template.Subject ?? entity.Subject) : entity.Subject;
                if (string.IsNullOrWhiteSpace(entity.BodyHtml))
                {
                    entity.BodyHtml = template.BodyHtml;
                    entity.BodyText = template.BodyText;
                }
            }
        }

        _db.Convocations.Add(entity);
        await PopulateRecipientsAsync(entity, channels, request.OwnerIds, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _audit.WriteAsync(
            "convocation.created",
            assemblyId: assembly.Id,
            correlationId: entity.Id,
            metadata: new { channels },
            cancellationToken: cancellationToken);

        return await GetAsync(entity.Id, cancellationToken);
    }

    public async Task<ConvocationDetailDto> ValidateAsync(Guid convocationId, CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var c = await _db.Convocations.FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        if (c.Status is ConvocationStatus.Sending or ConvocationStatus.Sent)
        {
            throw new DomainException("CONVOCATION_LOCKED", "Convocation already sent or sending.");
        }

        var channels = ParseChannels(c.ChannelsJson);
        var recipients = await _db.ConvocationRecipients.Where(r => r.ConvocationId == convocationId).ToListAsync(cancellationToken);
        foreach (var recipient in recipients)
        {
            var issues = ValidateRecipient(recipient, channels);
            recipient.IsValid = issues.Count == 0;
            recipient.ValidationIssuesJson = issues.Count == 0 ? null : JsonSerializer.Serialize(issues, JsonOptions);
        }

        var checks = await BuildChecksAsync(c, recipients, cancellationToken);
        var passed = checks.All(x => x.Passed);
        if (c.Status is ConvocationStatus.Draft or ConvocationStatus.Ready or ConvocationStatus.Approved)
        {
            if (!passed)
            {
                c.Status = ConvocationStatus.Draft;
            }
            else if (c.Status != ConvocationStatus.Approved)
            {
                c.Status = ConvocationStatus.Ready;
            }
        }

        await EnsureAssemblyParticipantsForRecipientsAsync(
            c.AssemblyId,
            c.TenantId,
            c.PropertyHorizontalId,
            recipients,
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return await GetAsync(convocationId, cancellationToken);
    }

    public async Task<ConvocationDetailDto> UpdateAsync(
        Guid convocationId,
        UpdateConvocationRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var c = await _db.Convocations.FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        if (c.Status is ConvocationStatus.Sending or ConvocationStatus.Sent or ConvocationStatus.Partial
            or ConvocationStatus.Failed or ConvocationStatus.Scheduled or ConvocationStatus.Cancelled)
        {
            throw new DomainException(
                "CONVOCATION_LOCKED",
                "Esta convocatoria ya se envió o está en curso. Su versión enviada se conserva.");
        }

        var title = request.Title?.Trim() ?? string.Empty;
        if (title.Length == 0)
        {
            throw new DomainException("TITLE_REQUIRED", "Indica un título para el borrador.");
        }

        var subject = string.IsNullOrWhiteSpace(request.Subject) ? title : request.Subject.Trim();
        var channels = ParseChannelNames(request.Channels);
        if (channels.Count == 0)
        {
            throw new DomainException("CHANNELS_REQUIRED", "Selecciona al menos un canal.");
        }

        var notes = request.BodyText ?? string.Empty;
        var previousOwners = await _db.ConvocationRecipients
            .AsNoTracking()
            .Where(r => r.ConvocationId == c.Id && r.OwnerId != null)
            .Select(r => r.OwnerId!.Value)
            .ToListAsync(cancellationToken);
        var nextOwners = request.OwnerIds?.Where(id => id != Guid.Empty).Distinct().OrderBy(id => id).ToList();
        var ownersChanged = nextOwners is not null
            && !previousOwners.OrderBy(id => id).SequenceEqual(nextOwners);
        var channelsJson = JsonSerializer.Serialize(channels.Select(ch => ch.ToString()), JsonOptions);
        var contentChanged = c.Title != title
            || c.Subject != subject
            || c.BodyText != notes
            || c.ChannelsJson != channelsJson
            || ownersChanged;

        c.Title = title;
        c.Subject = subject;
        c.BodyHtml = request.BodyHtml ?? string.Empty;
        c.BodyText = notes;
        c.ChannelsJson = channelsJson;
        if (contentChanged)
        {
            c.Version += 1;
            if (c.Status is ConvocationStatus.Ready or ConvocationStatus.Approved)
            {
                c.Status = ConvocationStatus.Draft;
            }
        }

        if (nextOwners is not null)
        {
            var existing = await _db.ConvocationRecipients.Where(r => r.ConvocationId == c.Id).ToListAsync(cancellationToken);
            _db.ConvocationRecipients.RemoveRange(existing);
            await PopulateRecipientsAsync(c, channels, nextOwners, cancellationToken);
        }
        else
        {
            var current = await _db.ConvocationRecipients.Where(r => r.ConvocationId == c.Id).ToListAsync(cancellationToken);
            foreach (var recipient in current)
            {
                recipient.ChannelsJson = channelsJson;
                var issues = ValidateRecipient(recipient, channels);
                recipient.IsValid = issues.Count == 0;
                recipient.ValidationIssuesJson = issues.Count == 0 ? null : JsonSerializer.Serialize(issues, JsonOptions);
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "convocation.updated",
            assemblyId: c.AssemblyId,
            correlationId: c.Id,
            metadata: new { c.Version, contentChanged, previousStatus = "draft-or-ready" },
            cancellationToken: cancellationToken);
        return await GetAsync(c.Id, cancellationToken);
    }

    public async Task<CommunicationBatchDto> SendAsync(
        Guid convocationId,
        SendConvocationRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        // Explicit confirm from UI (button). Legacy typed phrase still accepted.
        var phraseOk = string.Equals(
            request.ConfirmationPhrase?.Trim(),
            SendConfirmationPhrase,
            StringComparison.Ordinal);
        if (!request.Confirmed && !phraseOk)
        {
            throw new DomainException(
                "CONFIRMATION_REQUIRED",
                "Confirma el envío de la convocatoria para continuar.");
        }

        var c = await _db.Convocations.FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        if (c.Status is ConvocationStatus.Sending or ConvocationStatus.Sent or ConvocationStatus.Partial)
        {
            var replayKey = IdempotencyKeyNormalizer.Normalize(request.IdempotencyKey);
            if (replayKey is not null)
            {
                var existingBatch = await _db.CommunicationBatches
                    .AsNoTracking()
                    .FirstOrDefaultAsync(
                        b => b.ConvocationId == convocationId && b.IdempotencyKey == replayKey,
                        cancellationToken);
                if (existingBatch is not null)
                {
                    return ToBatchDto(existingBatch);
                }
            }

            throw new DomainException("ALREADY_SENT", "Convocation was already submitted for send.");
        }

        await ValidateAsync(convocationId, cancellationToken);
        c = await _db.Convocations.FirstAsync(x => x.Id == convocationId, cancellationToken);
        if (c.Status is not (ConvocationStatus.Ready or ConvocationStatus.Approved))
        {
            throw new DomainException(
                "VALIDATION_FAILED",
                "La convocatoria no pasó la validación. Revise cada comprobación antes de enviar.");
        }

        var recipientsQuery = _db.ConvocationRecipients.Where(r => r.ConvocationId == convocationId);
        if (request.RecipientIds is { Count: > 0 })
        {
            var selected = request.RecipientIds.Distinct().ToHashSet();
            recipientsQuery = recipientsQuery.Where(r => selected.Contains(r.Id));
        }

        var recipients = await recipientsQuery.ToListAsync(cancellationToken);

        if (recipients.Count == 0)
        {
            throw new DomainException("NO_RECIPIENTS", "Selecciona al menos un destinatario válido.");
        }

        if (recipients.Any(r => !r.IsValid))
        {
            throw new DomainException("VALIDATION_FAILED", "Hay destinatarios con datos incompletos. Corrige o desmárcalos.");
        }

        var channels = ParseChannels(c.ChannelsJson);
        await EnsureChannelsEnabledAsync(c.PropertyHorizontalId, channels, cancellationToken);

        var idempotency = IdempotencyKeyNormalizer.Require(
            request.IdempotencyKey,
            $"send-{convocationId:N}-{c.Version}");

        var existing = await _db.CommunicationBatches
            .FirstOrDefaultAsync(b => b.TenantId == _currentTenant.TenantId && b.IdempotencyKey == idempotency, cancellationToken);
        if (existing is not null)
        {
            return ToBatchDto(existing);
        }

        // Atomic claim: only one concurrent send can transition Draft/Ready/Approved → Sending.
        var claimed = await _db.Convocations
            .Where(x => x.Id == convocationId
                        && (x.Status == ConvocationStatus.Draft
                            || x.Status == ConvocationStatus.Ready
                            || x.Status == ConvocationStatus.Approved))
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(x => x.Status, ConvocationStatus.Sending),
                cancellationToken);

        if (claimed == 0)
        {
            var prior = await _db.CommunicationBatches
                .AsNoTracking()
                .Where(b => b.ConvocationId == convocationId)
                .OrderByDescending(b => b.CreatedAtUtc)
                .FirstOrDefaultAsync(cancellationToken);
            if (prior is not null)
            {
                return ToBatchDto(prior);
            }

            throw new DomainException("ALREADY_SENT", "Convocation was already submitted for send.");
        }

        c = await _db.Convocations.FirstAsync(x => x.Id == convocationId, cancellationToken);

        var batch = new CommunicationBatch
        {
            TenantId = _currentTenant.TenantId,
            ConvocationId = c.Id,
            IdempotencyKey = idempotency,
            Status = ConvocationStatus.Sending,
            StartedAtUtc = DateTimeOffset.UtcNow
        };
        _db.CommunicationBatches.Add(batch);

        var deliveries = new List<CommunicationDelivery>();
        foreach (var recipient in recipients)
        {
            foreach (var channel in channels)
            {
                deliveries.Add(new CommunicationDelivery
                {
                    TenantId = _currentTenant.TenantId,
                    BatchId = batch.Id,
                    ConvocationId = c.Id,
                    RecipientId = recipient.Id,
                    Channel = channel,
                    Status = DeliveryStatus.Pending,
                    QueuedAtUtc = DateTimeOffset.UtcNow
                });
            }
        }

        batch.TotalCount = deliveries.Count;
        _db.CommunicationDeliveries.AddRange(deliveries);
        await EnsureAssemblyParticipantsForRecipientsAsync(
            c.AssemblyId,
            c.TenantId,
            c.PropertyHorizontalId,
            recipients,
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        // Fix BatchId FK after batch Id assigned — deliveries were created with batch.Id already set since Guid.NewGuid on Entity.
        await _dispatch.ProcessBatchAsync(batch.Id, cancellationToken);

        await _audit.WriteAsync(
            "convocation.send.started",
            assemblyId: c.AssemblyId,
            correlationId: batch.Id,
            metadata: new { c.Id, batch.TotalCount },
            cancellationToken: cancellationToken);

        var refreshed = await _db.CommunicationBatches.AsNoTracking().FirstAsync(b => b.Id == batch.Id, cancellationToken);
        return ToBatchDto(refreshed);
    }

    public async Task<CommunicationBatchDto> ResendAsync(
        Guid convocationId,
        ResendConvocationRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        if (!request.Confirmed)
        {
            throw new DomainException("CONFIRMATION_REQUIRED", "Confirma el reenvío de la convocatoria.");
        }

        var c = await _db.Convocations.FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        var assemblyStatus = await _db.Assemblies.AsNoTracking()
            .Where(a => a.Id == c.AssemblyId)
            .Select(a => (AssemblyStatus?)a.Status)
            .FirstOrDefaultAsync(cancellationToken);
        if (assemblyStatus is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException(
                "ASSEMBLY_SEALED",
                "No se puede reenviar la convocatoria de una asamblea finalizada o cancelada.");
        }

        if (c.Status is not (ConvocationStatus.Sent or ConvocationStatus.Partial or ConvocationStatus.Failed or ConvocationStatus.Ready or ConvocationStatus.Approved or ConvocationStatus.Draft))
        {
            if (c.Status == ConvocationStatus.Sending)
            {
                throw new DomainException("SEND_IN_PROGRESS", "Hay un envío en curso. Espera a que termine.");
            }
        }

        var recipientsQuery = _db.ConvocationRecipients.Where(r => r.ConvocationId == convocationId && r.IsValid);
        if (request.RecipientIds is { Count: > 0 })
        {
            var selected = request.RecipientIds.Distinct().ToHashSet();
            recipientsQuery = recipientsQuery.Where(r => selected.Contains(r.Id));
        }

        var recipients = await recipientsQuery.ToListAsync(cancellationToken);
        if (recipients.Count == 0)
        {
            throw new DomainException("NO_RECIPIENTS", "Selecciona al menos un destinatario válido.");
        }

        if (request.OnlyFailedOrPending)
        {
            var okIds = await _db.CommunicationDeliveries.AsNoTracking()
                .Where(d => d.ConvocationId == convocationId
                            && d.Channel == CommunicationChannel.Email
                            && (d.Status == DeliveryStatus.Sent || d.Status == DeliveryStatus.Delivered))
                .Select(d => d.RecipientId)
                .Distinct()
                .ToListAsync(cancellationToken);
            var okSet = okIds.ToHashSet();
            recipients = recipients.Where(r => !okSet.Contains(r.Id)).ToList();
            if (recipients.Count == 0)
            {
                throw new DomainException("NOTHING_TO_RESEND", "No hay destinatarios pendientes o fallidos.");
            }
        }

        // Rate limit: block if any selected recipient was emailed in the last 45 seconds.
        var recentCutoff = DateTimeOffset.UtcNow.AddSeconds(-45);
        var recentlySent = await _db.CommunicationDeliveries.AsNoTracking()
            .Where(d => d.ConvocationId == convocationId
                        && d.Channel == CommunicationChannel.Email
                        && d.SentAtUtc != null
                        && d.SentAtUtc > recentCutoff
                        && recipients.Select(r => r.Id).Contains(d.RecipientId))
            .Select(d => d.RecipientId)
            .Distinct()
            .ToListAsync(cancellationToken);
        if (recentlySent.Count > 0)
        {
            throw new DomainException(
                "RESEND_COOLDOWN",
                "Espera unos segundos antes de reenviar a los mismos destinatarios.");
        }

        var channels = ParseChannels(c.ChannelsJson);
        await EnsureChannelsEnabledAsync(c.PropertyHorizontalId, channels, cancellationToken);

        var idempotency = IdempotencyKeyNormalizer.Require(
            request.IdempotencyKey,
            $"resend-{convocationId:N}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}");

        var existing = await _db.CommunicationBatches
            .FirstOrDefaultAsync(b => b.TenantId == _currentTenant.TenantId && b.IdempotencyKey == idempotency, cancellationToken);
        if (existing is not null)
        {
            return ToBatchDto(existing);
        }

        c.Status = ConvocationStatus.Sending;
        var batch = new CommunicationBatch
        {
            TenantId = _currentTenant.TenantId,
            ConvocationId = c.Id,
            IdempotencyKey = idempotency,
            Status = ConvocationStatus.Sending,
            StartedAtUtc = DateTimeOffset.UtcNow
        };
        _db.CommunicationBatches.Add(batch);

        var deliveries = new List<CommunicationDelivery>();
        foreach (var recipient in recipients)
        {
            foreach (var channel in channels)
            {
                deliveries.Add(new CommunicationDelivery
                {
                    TenantId = _currentTenant.TenantId,
                    BatchId = batch.Id,
                    ConvocationId = c.Id,
                    RecipientId = recipient.Id,
                    Channel = channel,
                    Status = DeliveryStatus.Pending,
                    QueuedAtUtc = DateTimeOffset.UtcNow
                });
            }
        }

        batch.TotalCount = deliveries.Count;
        _db.CommunicationDeliveries.AddRange(deliveries);
        await EnsureAssemblyParticipantsForRecipientsAsync(
            c.AssemblyId,
            c.TenantId,
            c.PropertyHorizontalId,
            recipients,
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _dispatch.ProcessBatchAsync(batch.Id, cancellationToken);

        await _audit.WriteAsync(
            "convocation.resend",
            assemblyId: c.AssemblyId,
            correlationId: batch.Id,
            metadata: new { c.Id, batch.TotalCount, recipientCount = recipients.Count },
            cancellationToken: cancellationToken);

        var refreshed = await _db.CommunicationBatches.AsNoTracking().FirstAsync(b => b.Id == batch.Id, cancellationToken);
        return ToBatchDto(refreshed);
    }

    /// <summary>
    /// Admin regenerate: rotate token for one recipient, revoke prior links, then email the new URL.
    /// </summary>
    public async Task<CommunicationBatchDto> RegenerateAccessLinkAsync(
        Guid convocationId,
        Guid recipientId,
        RegenerateAccessLinkRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        if (!request.Confirmed)
        {
            throw new DomainException(
                "CONFIRMATION_REQUIRED",
                "Confirme la regeneración. Al generar un nuevo enlace, el enlace anterior dejará de funcionar inmediatamente.");
        }

        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 3)
        {
            throw new DomainException("REASON_REQUIRED", "Indique el motivo de la regeneración del enlace.");
        }

        var c = await _db.Convocations.FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        var assembly = await _db.Assemblies.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == c.AssemblyId, cancellationToken)
            ?? throw new DomainException("ASSEMBLY_NOT_FOUND", "Assembly not found.");
        if (assembly.Status is AssemblyStatus.Cancelled)
        {
            throw new DomainException("ASSEMBLY_CANCELLED", "No se puede regenerar el enlace de una asamblea cancelada.");
        }

        var recipient = await _db.ConvocationRecipients
            .FirstOrDefaultAsync(r => r.Id == recipientId && r.ConvocationId == convocationId && r.IsValid, cancellationToken)
            ?? throw new DomainException("RECIPIENT_NOT_FOUND", "Destinatario no encontrado en esta convocatoria.");

        await _accessLinks.RegenerateAsync(
            c,
            recipient,
            deliveryId: null,
            assembly.ScheduledAtUtc,
            assembly.EstimatedEndAtUtc,
            userId,
            request.Reason.Trim(),
            cancellationToken);

        // Email the new URL via the normal dispatch pipeline. Prefer Resend when allowed;
        // if the assembly is sealed (Completed), still deliver the replacement link once.
        try
        {
            return await ResendAsync(
                convocationId,
                new ResendConvocationRequest(
                    Confirmed: true,
                    IdempotencyKey: IdempotencyKeyNormalizer.Require(
                        request.IdempotencyKey,
                        $"regen-{convocationId:N}-{recipientId:N}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"),
                    RecipientIds: [recipientId],
                    OnlyFailedOrPending: false),
                cancellationToken);
        }
        catch (DomainException ex) when (ex.Code is "ASSEMBLY_SEALED" or "RESEND_COOLDOWN")
        {
            return await ForceEmailRecipientsAsync(
                c,
                [recipient],
                idempotencyKey: IdempotencyKeyNormalizer.Require(
                    string.IsNullOrWhiteSpace(request.IdempotencyKey)
                        ? null
                        : $"{request.IdempotencyKey.Trim()}-force",
                    $"regen-force-{convocationId:N}-{recipientId:N}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"),
                auditEvent: "access_link.regenerated.emailed",
                cancellationToken);
        }
    }

    private async Task<CommunicationBatchDto> ForceEmailRecipientsAsync(
        Convocation c,
        IReadOnlyList<ConvocationRecipient> recipients,
        string idempotencyKey,
        string auditEvent,
        CancellationToken cancellationToken)
    {
        var channels = ParseChannels(c.ChannelsJson);
        if (channels.Count == 0)
        {
            channels = [CommunicationChannel.Email];
        }

        await EnsureChannelsEnabledAsync(c.PropertyHorizontalId, channels, cancellationToken);

        idempotencyKey = IdempotencyKeyNormalizer.Require(idempotencyKey, $"force-{c.Id:N}");

        var existing = await _db.CommunicationBatches
            .FirstOrDefaultAsync(b => b.TenantId == _currentTenant.TenantId && b.IdempotencyKey == idempotencyKey, cancellationToken);
        if (existing is not null)
        {
            return ToBatchDto(existing);
        }

        var batch = new CommunicationBatch
        {
            TenantId = _currentTenant.TenantId,
            ConvocationId = c.Id,
            IdempotencyKey = idempotencyKey,
            Status = ConvocationStatus.Sending,
            StartedAtUtc = DateTimeOffset.UtcNow
        };
        _db.CommunicationBatches.Add(batch);

        var deliveries = new List<CommunicationDelivery>();
        foreach (var recipient in recipients)
        {
            foreach (var channel in channels)
            {
                deliveries.Add(new CommunicationDelivery
                {
                    TenantId = _currentTenant.TenantId,
                    BatchId = batch.Id,
                    ConvocationId = c.Id,
                    RecipientId = recipient.Id,
                    Channel = channel,
                    Status = DeliveryStatus.Pending,
                    QueuedAtUtc = DateTimeOffset.UtcNow
                });
            }
        }

        batch.TotalCount = deliveries.Count;
        _db.CommunicationDeliveries.AddRange(deliveries);
        await _db.SaveChangesAsync(cancellationToken);
        await _dispatch.ProcessBatchAsync(batch.Id, cancellationToken);
        await _audit.WriteAsync(
            auditEvent,
            assemblyId: c.AssemblyId,
            correlationId: batch.Id,
            metadata: new { c.Id, batch.TotalCount, recipientCount = recipients.Count },
            cancellationToken: cancellationToken);
        var refreshed = await _db.CommunicationBatches.AsNoTracking().FirstAsync(b => b.Id == batch.Id, cancellationToken);
        return ToBatchDto(refreshed);
    }

    public async Task<IReadOnlyList<ConvocationRecipientDeliveryDto>> ListRecipientDeliveryStatusAsync(
        Guid convocationId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var c = await _db.Convocations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        var recipients = await _db.ConvocationRecipients.AsNoTracking()
            .Where(r => r.ConvocationId == convocationId)
            .OrderBy(r => r.DisplayName)
            .ToListAsync(cancellationToken);

        var deliveries = await _db.CommunicationDeliveries.AsNoTracking()
            .Where(d => d.ConvocationId == convocationId && d.Channel == CommunicationChannel.Email)
            .ToListAsync(cancellationToken);

        var byRecipient = deliveries.GroupBy(d => d.RecipientId).ToDictionary(g => g.Key, g => g.ToList());
        var cooldown = DateTimeOffset.UtcNow.AddSeconds(-45);

        return recipients.Select(r =>
        {
            byRecipient.TryGetValue(r.Id, out var list);
            list ??= [];
            var last = list.OrderByDescending(d => d.SentAtUtc ?? d.CreatedAtUtc).FirstOrDefault();
            var status = last?.Status.ToString() ?? "NotSent";
            var lastSent = list.Where(d => d.SentAtUtc != null).Max(d => d.SentAtUtc);
            var attempts = list.Count;
            var canResend = r.IsValid && (lastSent is null || lastSent <= cooldown);
            return new ConvocationRecipientDeliveryDto(
                r.Id,
                r.DisplayName,
                r.Email,
                null,
                status,
                lastSent,
                attempts,
                canResend);
        }).ToList();
    }

    public async Task<IReadOnlyList<DeliveryDto>> ListDeliveriesAsync(
        Guid convocationId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var c = await _db.Convocations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        var rows = await _db.CommunicationDeliveries
            .AsNoTracking()
            .Where(d => d.ConvocationId == convocationId)
            .OrderBy(d => d.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return rows.Select(d => new DeliveryDto(
            d.Id,
            d.RecipientId,
            d.Channel.ToString(),
            d.Status.ToString(),
            d.Destination,
            d.WasRedirectedToTestOverride,
            d.ProviderType.ToString(),
            d.ProviderMessageId,
            d.ErrorDetail,
            d.SentAtUtc,
            d.DeliveredAtUtc)).ToList();
    }

    public async Task<IReadOnlyList<PortalNotificationDto>> ListMyPortalNotificationsAsync(
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);

        var rows = await _db.PortalNotifications
            .AsNoTracking()
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAtUtc)
            .Take(100)
            .ToListAsync(cancellationToken);

        return rows.Select(n => new PortalNotificationDto(
            n.Id, n.Title, n.Body, n.IsRead, n.CreatedAtUtc, n.ConvocationId)).ToList();
    }

    public async Task<PortalNotificationDto> MarkPortalReadAsync(
        Guid notificationId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = TenantGuard.RequireUserId(_currentTenant);
        var row = await _db.PortalNotifications.FirstOrDefaultAsync(n => n.Id == notificationId, cancellationToken)
            ?? throw new DomainException("PORTAL_NOT_FOUND", "Notification not found.");
        if (row.UserId != userId)
        {
            throw new DomainException("PORTAL_FORBIDDEN", "Notification does not belong to current user.");
        }

        row.IsRead = true;
        row.ReadAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return new PortalNotificationDto(row.Id, row.Title, row.Body, row.IsRead, row.CreatedAtUtc, row.ConvocationId);
    }

    private async Task<IReadOnlyList<ConvocationCheckDto>> BuildChecksAsync(
        Convocation c,
        IReadOnlyList<ConvocationRecipient> recipients,
        CancellationToken cancellationToken)
    {
        var checks = new List<ConvocationCheckDto>();
        var channels = ParseChannels(c.ChannelsJson);
        checks.Add(new ConvocationCheckDto(
            "title",
            "Título",
            !string.IsNullOrWhiteSpace(c.Title),
            string.IsNullOrWhiteSpace(c.Title) ? "Falta el título." : "El título está definido."));
        checks.Add(new ConvocationCheckDto(
            "subject",
            "Asunto",
            !string.IsNullOrWhiteSpace(c.Subject),
            string.IsNullOrWhiteSpace(c.Subject)
                ? "Falta el asunto. La vista previa y el envío usan el mismo texto."
                : $"La vista previa y el envío usan este asunto: {c.Subject.Trim()}"));
        checks.Add(new ConvocationCheckDto(
            "channels",
            "Canales",
            channels.Count > 0,
            channels.Count == 0 ? "Selecciona al menos un canal." : $"Canales del borrador: {string.Join(", ", channels)}."));

        var configs = await _db.ChannelConfigurations
            .AsNoTracking()
            .Where(x => x.PropertyHorizontalId == c.PropertyHorizontalId)
            .ToListAsync(cancellationToken);
        foreach (var channel in channels)
        {
            var cfg = configs.FirstOrDefault(x => x.Channel == channel);
            var enabled = cfg is { IsEnabled: true };
            checks.Add(new ConvocationCheckDto(
                $"channel-{channel}",
                $"Canal {channel}",
                enabled,
                enabled
                    ? "Disponible para envío."
                    : "No está configurado o está desactivado. No se cuenta como entrega."));
        }

        checks.Add(new ConvocationCheckDto(
            "recipients",
            "Destinatarios del borrador",
            recipients.Count > 0,
            recipients.Count == 0
                ? "El borrador no tiene destinatarios. Validar no crea entregas."
                : $"{recipients.Count} destinatario(s) en el borrador. Esto no es un envío."));

        var invalid = recipients.Where(r => !r.IsValid).Select(r => r.DisplayName).ToList();
        checks.Add(new ConvocationCheckDto(
            "recipient-data",
            "Datos de contacto",
            recipients.Count > 0 && invalid.Count == 0,
            invalid.Count == 0
                ? "Los destinatarios del borrador tienen los datos de sus canales."
                : $"Datos incompletos: {string.Join(", ", invalid)}. No se infiere una entrega."));

        checks.Add(new ConvocationCheckDto(
            "internal-notes",
            "Notas internas",
            true,
            "Las notas internas quedan en el expediente y no forman parte del mensaje al destinatario."));

        checks.Add(new ConvocationCheckDto(
            "deliveries",
            "Entregas",
            true,
            c.SentAtUtc is null
                ? "Todavía no hay envíos. La validación no cuenta como entrega."
                : "Hay un envío registrado. El resultado se lee de cada entrega, no de la selección."));
        return checks;
    }

    private async Task EnsureChannelsEnabledAsync(
        Guid propertyHorizontalId,
        IReadOnlyList<CommunicationChannel> channels,
        CancellationToken cancellationToken)
    {
        var configs = await _db.ChannelConfigurations
            .AsNoTracking()
            .Where(c => c.PropertyHorizontalId == propertyHorizontalId)
            .ToListAsync(cancellationToken);

        foreach (var channel in channels)
        {
            var cfg = configs.FirstOrDefault(c => c.Channel == channel);
            if (cfg is null || !cfg.IsEnabled)
            {
                throw new DomainException(
                    "CHANNEL_DISABLED",
                    $"Channel {channel} is disabled or not configured. Enable it before send.");
            }
        }
    }

    /// <summary>
    /// Convoked owners with platform accounts must be enrolled as assembly participants
    /// so owner portal and attendance flows can resolve the assembly.
    /// </summary>
    private async Task EnsureAssemblyParticipantsForRecipientsAsync(
        Guid assemblyId,
        Guid tenantId,
        Guid propertyHorizontalId,
        IReadOnlyList<ConvocationRecipient> recipients,
        CancellationToken cancellationToken)
    {
        var enrollable = recipients
            .Where(r => r.IsValid && r.UserId is Guid userId && userId != Guid.Empty)
            .ToList();

        // Recipients / owners without a login account cannot appear on the accreditation desk
        // (participants are keyed by UserId). Provision a passwordless Owner identity when missing.
        var needsUserSync = recipients
            .Where(r => r.IsValid && r.OwnerId is Guid && (r.UserId is null || r.UserId == Guid.Empty))
            .ToList();
        if (needsUserSync.Count > 0)
        {
            var ownerIdsForSync = needsUserSync.Select(r => r.OwnerId!.Value).Distinct().ToList();
            var owners = await _db.Owners
                .Where(o => ownerIdsForSync.Contains(o.Id))
                .ToListAsync(cancellationToken);
            var ownersById = owners.ToDictionary(o => o.Id);

            Guid? organizationId = await _db.PropertyHorizontals.AsNoTracking()
                .Where(p => p.Id == propertyHorizontalId)
                .Select(p => (Guid?)p.OrganizationId)
                .FirstOrDefaultAsync(cancellationToken);

            foreach (var recipient in needsUserSync)
            {
                if (!ownersById.TryGetValue(recipient.OwnerId!.Value, out var owner))
                {
                    continue;
                }

                Guid userId;
                if (owner.UserId is Guid linked && linked != Guid.Empty)
                {
                    userId = linked;
                }
                else
                {
                    var email = !string.IsNullOrWhiteSpace(owner.Email)
                        ? owner.Email
                        : recipient.Email;
                    if (string.IsNullOrWhiteSpace(email))
                    {
                        continue;
                    }

                    var displayName = string.IsNullOrWhiteSpace(owner.DisplayName)
                        ? (string.IsNullOrWhiteSpace(recipient.DisplayName) ? email.Trim() : recipient.DisplayName.Trim())
                        : owner.DisplayName.Trim();

                    userId = await _identity.EnsureOwnerUserPasswordlessAsync(
                        tenantId,
                        organizationId,
                        email.Trim(),
                        displayName,
                        cancellationToken);
                    owner.UserId = userId;
                }

                recipient.UserId = userId;
                if (!enrollable.Contains(recipient))
                {
                    enrollable.Add(recipient);
                }
            }
        }

        if (enrollable.Count == 0)
        {
            return;
        }

        var userIds = enrollable.Select(r => r.UserId!.Value).Distinct().ToList();
        var existingUserIds = await _db.AssemblyParticipants
            .Where(p => p.AssemblyId == assemblyId && userIds.Contains(p.UserId))
            .Select(p => p.UserId)
            .ToListAsync(cancellationToken);
        var existing = existingUserIds.ToHashSet();

        var missing = enrollable
            .Where(r => !existing.Contains(r.UserId!.Value))
            .GroupBy(r => r.UserId!.Value)
            .Select(g => g.First())
            .ToList();
        if (missing.Count == 0)
        {
            return;
        }

        var ownerIds = missing
            .Where(r => r.OwnerId is Guid ownerId && ownerId != Guid.Empty)
            .Select(r => r.OwnerId!.Value)
            .Distinct()
            .ToList();

        Dictionary<Guid, Guid> unitByOwner = [];
        if (ownerIds.Count > 0)
        {
            var ownershipRows = await (
                from own in _db.Ownerships.AsNoTracking()
                join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
                where ownerIds.Contains(own.OwnerId)
                      && own.IsActive
                      && u.PropertyHorizontalId == propertyHorizontalId
                select new { own.OwnerId, own.UnitId, own.SharePercent })
                .ToListAsync(cancellationToken);

            unitByOwner = ownershipRows
                .GroupBy(x => x.OwnerId)
                .ToDictionary(
                    g => g.Key,
                    g => g.OrderByDescending(x => x.SharePercent).First().UnitId);
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var recipient in missing)
        {
            Guid? unitId = recipient.OwnerId is Guid ownerId && unitByOwner.TryGetValue(ownerId, out var uid)
                ? uid
                : null;

            _db.AssemblyParticipants.Add(new AssemblyParticipant
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                AssemblyId = assemblyId,
                UserId = recipient.UserId!.Value,
                UnitId = unitId,
                DisplayName = string.IsNullOrWhiteSpace(recipient.DisplayName)
                    ? "Propietario"
                    : recipient.DisplayName.Trim(),
                RoleCode = Roles.Owner,
                AttendanceStatus = AttendanceStatus.Registered,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }
    }

    /// <summary>
    /// Heals accreditation roster: re-enrolls valid recipients from the latest sent/draft convocation
    /// (provisions Owner login accounts when missing so they appear on the desk).
    /// </summary>
    public async Task SyncAssemblyParticipantsAsync(Guid assemblyId, CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await EnsureAssemblyAsync(assemblyId, cancellationToken);

        var convocation = await _db.Convocations
            .AsNoTracking()
            .Where(c => c.AssemblyId == assemblyId
                        && (c.Status == ConvocationStatus.Sent
                            || c.Status == ConvocationStatus.Draft
                            || c.Status == ConvocationStatus.Ready
                            || c.Status == ConvocationStatus.Approved))
            .OrderByDescending(c => c.SentAtUtc ?? c.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
        if (convocation is null)
        {
            return;
        }

        var recipients = await _db.ConvocationRecipients
            .Where(r => r.ConvocationId == convocation.Id && r.IsValid)
            .ToListAsync(cancellationToken);
        if (recipients.Count == 0)
        {
            return;
        }

        await EnsureAssemblyParticipantsForRecipientsAsync(
            assembly.Id,
            assembly.TenantId,
            assembly.PropertyHorizontalId,
            recipients,
            cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task PopulateRecipientsAsync(
        Convocation convocation,
        IReadOnlyList<CommunicationChannel> channels,
        IReadOnlyList<Guid>? ownerIdsFilter,
        CancellationToken cancellationToken)
    {
        // Only owners with Active/Invited status AND at least one active ownership on this PH.
        var owners = await (
            from o in _db.Owners.AsNoTracking()
            join own in _db.Ownerships.AsNoTracking() on o.Id equals own.OwnerId
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where u.PropertyHorizontalId == convocation.PropertyHorizontalId
                  && own.IsActive
                  && u.IsActive
                  && (o.Status == OwnerLifecycleStatus.Active || o.Status == OwnerLifecycleStatus.Invited)
            select o)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (ownerIdsFilter is { Count: > 0 })
        {
            var wanted = ownerIdsFilter.Where(id => id != Guid.Empty).Distinct().ToHashSet();
            var matched = owners.Where(o => wanted.Contains(o.Id)).ToList();
            var missing = wanted.Except(matched.Select(o => o.Id)).ToList();
            if (missing.Count > 0)
            {
                throw new DomainException(
                    "OWNER_NOT_ELIGIBLE",
                    "Uno o más propietarios no son elegibles para convocatoria. Deben estar Activo o Invitado y tener al menos una unidad activa en esta PH.");
            }

            owners = matched;
        }
        else if (ownerIdsFilter is { Count: 0 })
        {
            throw new DomainException(
                "OWNER_IDS_REQUIRED",
                "Selecciona al menos un propietario destinatario.");
        }

        foreach (var owner in owners)
        {
            AddRecipientEntity(convocation, owner, channels);
        }
    }

    /// <summary>
    /// Adds missing eligible owners to an existing convocation (draft or already sent) so they can be invited/resent.
    /// </summary>
    public async Task<ConvocationDetailDto> AddRecipientsAsync(
        Guid convocationId,
        AddConvocationRecipientsRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        TenantGuard.EnsureAuthenticated(_currentTenant);

        if (request.OwnerIds is null || request.OwnerIds.Count == 0)
        {
            throw new DomainException("OWNER_IDS_REQUIRED", "Selecciona al menos un propietario destinatario.");
        }

        var c = await _db.Convocations.FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        if (c.Status == ConvocationStatus.Sending)
        {
            throw new DomainException("SEND_IN_PROGRESS", "Hay un envío en curso. Espera a que termine.");
        }

        var assemblyStatus = await _db.Assemblies.AsNoTracking()
            .Where(a => a.Id == c.AssemblyId)
            .Select(a => (AssemblyStatus?)a.Status)
            .FirstOrDefaultAsync(cancellationToken);
        if (assemblyStatus is AssemblyStatus.Completed or AssemblyStatus.Cancelled)
        {
            throw new DomainException(
                "ASSEMBLY_SEALED",
                "No se pueden agregar destinatarios a una asamblea finalizada o cancelada.");
        }

        var channels = ParseChannels(c.ChannelsJson);
        var wanted = request.OwnerIds.Where(id => id != Guid.Empty).Distinct().ToList();

        var eligible = await (
            from o in _db.Owners.AsNoTracking()
            join own in _db.Ownerships.AsNoTracking() on o.Id equals own.OwnerId
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where u.PropertyHorizontalId == c.PropertyHorizontalId
                  && own.IsActive
                  && u.IsActive
                  && wanted.Contains(o.Id)
                  && (o.Status == OwnerLifecycleStatus.Active || o.Status == OwnerLifecycleStatus.Invited)
            select o)
            .Distinct()
            .ToListAsync(cancellationToken);

        var missing = wanted.Except(eligible.Select(o => o.Id)).ToList();
        if (missing.Count > 0)
        {
            throw new DomainException(
                "OWNER_NOT_ELIGIBLE",
                "Uno o más propietarios no son elegibles (Activo/Invitado con unidad en esta PH).");
        }

        var existingOwnerIds = await _db.ConvocationRecipients
            .Where(r => r.ConvocationId == convocationId && r.OwnerId != null)
            .Select(r => r.OwnerId!.Value)
            .ToListAsync(cancellationToken);
        var existing = existingOwnerIds.ToHashSet();

        var added = 0;
        foreach (var owner in eligible)
        {
            if (existing.Contains(owner.Id))
            {
                continue;
            }

            AddRecipientEntity(c, owner, channels);
            added++;
        }

        if (added == 0)
        {
            return await GetAsync(convocationId, cancellationToken);
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _audit.WriteAsync(
            "convocation.recipients.added",
            assemblyId: c.AssemblyId,
            correlationId: c.Id,
            metadata: new { OwnerIds = eligible.Select(o => o.Id).ToArray(), Added = added },
            cancellationToken: cancellationToken);

        return await GetAsync(convocationId, cancellationToken);
    }

    private void AddRecipientEntity(
        Convocation convocation,
        Owner owner,
        IReadOnlyList<CommunicationChannel> channels)
    {
        var recipient = new ConvocationRecipient
        {
            TenantId = convocation.TenantId,
            ConvocationId = convocation.Id,
            OwnerId = owner.Id,
            UserId = owner.UserId,
            DisplayName = owner.DisplayName,
            Email = string.IsNullOrWhiteSpace(owner.Email) ? null : owner.Email.Trim(),
            ChannelsJson = JsonSerializer.Serialize(channels.Select(ch => ch.ToString()), JsonOptions)
        };
        var issues = ValidateRecipient(recipient, channels);
        recipient.IsValid = issues.Count == 0;
        recipient.ValidationIssuesJson = issues.Count == 0 ? null : JsonSerializer.Serialize(issues, JsonOptions);
        _db.ConvocationRecipients.Add(recipient);
    }

    private async Task<SendPreviewDto> BuildPreviewAsync(
        Convocation c,
        IReadOnlyList<ConvocationRecipient> recipients,
        CancellationToken cancellationToken)
    {
        var (profile, _, _, _, _) = await _config.LoadRuntimeAsync(c.PropertyHorizontalId, cancellationToken);
        var channels = ParseChannels(c.ChannelsJson);
        var channelCounts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var channel in channels)
        {
            channelCounts[channel.ToString()] = recipients.Count(r =>
                channel switch
                {
                    CommunicationChannel.Email => !string.IsNullOrWhiteSpace(r.Email),
                    CommunicationChannel.WhatsApp or CommunicationChannel.Sms => !string.IsNullOrWhiteSpace(r.PhoneE164),
                    CommunicationChannel.Portal => r.UserId is not null || r.OwnerId is not null,
                    _ => true
                });
        }

        var missingExternal = recipients.Count(r =>
            channels.Any(ch => ch is CommunicationChannel.Email or CommunicationChannel.WhatsApp or CommunicationChannel.Sms)
            && string.IsNullOrWhiteSpace(r.Email) && string.IsNullOrWhiteSpace(r.PhoneE164));

        return new SendPreviewDto(
            recipients.Count,
            channelCounts,
            missingExternal,
            profile.SandboxMode,
            profile.TestRecipientOverride,
            _environment.EnvironmentLabel);
    }

    private static List<string> ValidateRecipient(ConvocationRecipient recipient, IReadOnlyList<CommunicationChannel> channels)
    {
        var issues = new List<string>();
        foreach (var channel in channels)
        {
            switch (channel)
            {
                case CommunicationChannel.Email when string.IsNullOrWhiteSpace(recipient.Email):
                    issues.Add("Missing email for Email channel.");
                    break;
                case CommunicationChannel.WhatsApp when string.IsNullOrWhiteSpace(recipient.PhoneE164):
                    issues.Add("Missing phone for WhatsApp channel.");
                    break;
                case CommunicationChannel.Sms when string.IsNullOrWhiteSpace(recipient.PhoneE164):
                    issues.Add("Missing phone for SMS channel.");
                    break;
            }
        }

        return issues;
    }

    private async Task<Assembly> EnsureAssemblyAsync(Guid assemblyId, CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies.AsNoTracking().FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException("ASSEMBLY_NOT_FOUND", "Assembly not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        return assembly;
    }

    private static IReadOnlyList<CommunicationChannel> ParseChannels(string json)
    {
        try
        {
            var names = JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? [];
            return ParseChannelNames(names);
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IReadOnlyList<CommunicationChannel> ParseChannelNames(IReadOnlyList<string>? names)
    {
        var list = new List<CommunicationChannel>();
        if (names is null)
        {
            return list;
        }

        foreach (var name in names)
        {
            if (Enum.TryParse<CommunicationChannel>(name, ignoreCase: true, out var channel) && !list.Contains(channel))
            {
                list.Add(channel);
            }
        }

        return list;
    }

    private static ConvocationDetailDto ToDetail(
        Convocation c,
        IReadOnlyList<ConvocationRecipient> recipients,
        SendPreviewDto preview,
        IReadOnlyList<ConvocationCheckDto>? checks = null) =>
        new(
            c.Id,
            c.AssemblyId,
            c.PropertyHorizontalId,
            c.Title,
            c.Status.ToString(),
            c.Version,
            ParseChannels(c.ChannelsJson).Select(x => x.ToString()).ToList(),
            c.Subject,
            c.BodyHtml,
            c.BodyText,
            c.ScheduledAtUtc,
            c.SentAtUtc,
            recipients.Select(r => new ConvocationRecipientDto(
                r.Id,
                r.OwnerId,
                r.DisplayName,
                r.Email,
                r.PhoneE164,
                ParseChannels(r.ChannelsJson).Select(x => x.ToString()).ToList(),
                r.IsValid,
                ParseIssues(r.ValidationIssuesJson))).ToList(),
            preview,
            checks);

    private static IReadOnlyList<string> ParseIssues(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static CommunicationBatchDto ToBatchDto(CommunicationBatch b) =>
        new(b.Id, b.ConvocationId, b.Status.ToString(), b.TotalCount, b.SentCount, b.DeliveredCount, b.FailedCount, b.SkippedCount, b.StartedAtUtc, b.CompletedAtUtc);
}
