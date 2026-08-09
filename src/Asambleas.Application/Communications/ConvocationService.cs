namespace Asambleas.Application.Communications;

using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Common;
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

    public ConvocationService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAuditService audit,
        ICommunicationEnvironment environment,
        CommunicationConfigurationService config,
        DeliveryDispatchService dispatch)
    {
        _db = db;
        _currentTenant = currentTenant;
        _audit = audit;
        _environment = environment;
        _config = config;
        _dispatch = dispatch;
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

        return rows.Select(c =>
        {
            var stats = recipientStats.FirstOrDefault(s => s.ConvocationId == c.Id);
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
                stats?.Valid ?? 0);
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
        return ToDetail(c, recipients, preview);
    }

    public async Task<ConvocationDetailDto> CreateAsync(
        CreateConvocationRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var assembly = await EnsureAssemblyAsync(request.AssemblyId, cancellationToken);

        if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
        {
            var existing = await _db.Convocations
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    c => c.TenantId == _currentTenant.TenantId && c.IdempotencyKey == request.IdempotencyKey,
                    cancellationToken);
            if (existing is not null)
            {
                return await GetAsync(existing.Id, cancellationToken);
            }
        }

        var channels = ParseChannelNames(request.Channels);
        if (channels.Count == 0)
        {
            throw new DomainException("CHANNELS_REQUIRED", "Select at least one channel.");
        }

        var entity = new Convocation
        {
            TenantId = _currentTenant.TenantId,
            PropertyHorizontalId = assembly.PropertyHorizontalId,
            AssemblyId = assembly.Id,
            Title = request.Title.Trim(),
            Subject = request.Subject.Trim(),
            BodyHtml = request.BodyHtml,
            BodyText = request.BodyText,
            ChannelsJson = JsonSerializer.Serialize(channels.Select(c => c.ToString()), JsonOptions),
            TemplateId = request.TemplateId,
            CreatedByUserId = TenantGuard.RequireUserId(_currentTenant),
            IdempotencyKey = string.IsNullOrWhiteSpace(request.IdempotencyKey) ? null : request.IdempotencyKey.Trim(),
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
        await PopulateRecipientsAsync(entity, channels, cancellationToken);
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

        c.Status = recipients.All(r => r.IsValid) ? ConvocationStatus.Ready : ConvocationStatus.Draft;
        await _db.SaveChangesAsync(cancellationToken);
        return await GetAsync(convocationId, cancellationToken);
    }

    public async Task<CommunicationBatchDto> SendAsync(
        Guid convocationId,
        SendConvocationRequest request,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        if (!string.Equals(request.ConfirmationPhrase?.Trim(), SendConfirmationPhrase, StringComparison.Ordinal))
        {
            throw new DomainException(
                "CONFIRMATION_REQUIRED",
                $"Type '{SendConfirmationPhrase}' to confirm mass send.");
        }

        var c = await _db.Convocations.FirstOrDefaultAsync(x => x.Id == convocationId, cancellationToken)
            ?? throw new DomainException("CONVOCATION_NOT_FOUND", "Convocation not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, c.TenantId);

        if (c.Status is ConvocationStatus.Sending or ConvocationStatus.Sent or ConvocationStatus.Partial)
        {
            if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
            {
                var existingBatch = await _db.CommunicationBatches
                    .AsNoTracking()
                    .FirstOrDefaultAsync(
                        b => b.ConvocationId == convocationId && b.IdempotencyKey == request.IdempotencyKey,
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

        var recipients = await _db.ConvocationRecipients
            .Where(r => r.ConvocationId == convocationId)
            .ToListAsync(cancellationToken);

        if (recipients.Count == 0)
        {
            throw new DomainException("NO_RECIPIENTS", "No recipients to send.");
        }

        if (recipients.Any(r => !r.IsValid))
        {
            throw new DomainException("VALIDATION_FAILED", "Fix recipient validation issues before send.");
        }

        var channels = ParseChannels(c.ChannelsJson);
        await EnsureChannelsEnabledAsync(c.PropertyHorizontalId, channels, cancellationToken);

        var idempotency = string.IsNullOrWhiteSpace(request.IdempotencyKey)
            ? $"send-{convocationId:N}-{c.Version}"
            : request.IdempotencyKey.Trim();

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
        await _db.SaveChangesAsync(cancellationToken);

        // Fix BatchId FK after batch Id assigned — deliveries were created with batch.Id already set since Guid.NewGuid on Entity.
        await _dispatch.ProcessBatchAsync(batch.Id, cancellationToken);

        await _audit.WriteAsync(
            "convocation.send.started",
            assemblyId: c.AssemblyId,
            correlationId: batch.Id,
            metadata: new { c.Id, batch.TotalCount, sandbox = _environment.IsNonProduction },
            cancellationToken: cancellationToken);

        var refreshed = await _db.CommunicationBatches.AsNoTracking().FirstAsync(b => b.Id == batch.Id, cancellationToken);
        return ToBatchDto(refreshed);
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

    private async Task PopulateRecipientsAsync(
        Convocation convocation,
        IReadOnlyList<CommunicationChannel> channels,
        CancellationToken cancellationToken)
    {
        var owners = await (
            from o in _db.Owners.AsNoTracking()
            join own in _db.Ownerships.AsNoTracking() on o.Id equals own.OwnerId
            join u in _db.Units.AsNoTracking() on own.UnitId equals u.Id
            where u.PropertyHorizontalId == convocation.PropertyHorizontalId
            select o)
            .Distinct()
            .ToListAsync(cancellationToken);

        foreach (var owner in owners)
        {
            var recipient = new ConvocationRecipient
            {
                TenantId = convocation.TenantId,
                ConvocationId = convocation.Id,
                OwnerId = owner.Id,
                UserId = owner.UserId,
                DisplayName = owner.DisplayName,
                Email = string.IsNullOrWhiteSpace(owner.Email) ? null : owner.Email.Trim(),
                ChannelsJson = JsonSerializer.Serialize(channels.Select(c => c.ToString()), JsonOptions)
            };
            var issues = ValidateRecipient(recipient, channels);
            recipient.IsValid = issues.Count == 0;
            recipient.ValidationIssuesJson = issues.Count == 0 ? null : JsonSerializer.Serialize(issues, JsonOptions);
            _db.ConvocationRecipients.Add(recipient);
        }
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
            profile.SandboxMode || _environment.IsNonProduction,
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

    private static IReadOnlyList<CommunicationChannel> ParseChannelNames(IReadOnlyList<string> names)
    {
        var list = new List<CommunicationChannel>();
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
        SendPreviewDto preview) =>
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
            preview);

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
