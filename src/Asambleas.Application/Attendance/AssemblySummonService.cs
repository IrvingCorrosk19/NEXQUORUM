namespace Asambleas.Application.Attendance;

using System.Collections.Concurrent;
using System.Net;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Abstractions.Communications;
using Asambleas.Application.Common;
using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Contracts.Realtime;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Summons absent participants to join the live room ("Avisar para unirse").
/// SignalR is primary; when the hub is offline, email is used if PH email + join link are available.
/// </summary>
public sealed class AssemblySummonService
{
    private static readonly TimeSpan Cooldown = TimeSpan.FromSeconds(60);
    private static readonly ConcurrentDictionary<string, DateTimeOffset> LastSummonUtc = new();

    private const string OfflineNoChannelDetail =
        "El participante no tiene la plataforma abierta y no existe un canal externo configurado.";

    private const string PresidentRequestMessage =
        "El presidente ha iniciado la asamblea y solicita que te unas.";

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly IAuditService _audit;
    private readonly IAssemblyHubPresence _hubPresence;
    private readonly CommunicationConfigurationService _communications;
    private readonly AssemblyAccessLinkService _accessLinks;
    private readonly IOwnerPortalIdentityService _identity;

    public AssemblySummonService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAssemblyRealtimePublisher realtime,
        IAuditService audit,
        IAssemblyHubPresence hubPresence,
        CommunicationConfigurationService communications,
        AssemblyAccessLinkService accessLinks,
        IOwnerPortalIdentityService identity)
    {
        _db = db;
        _currentTenant = currentTenant;
        _realtime = realtime;
        _audit = audit;
        _hubPresence = hubPresence;
        _communications = communications;
        _accessLinks = accessLinks;
        _identity = identity;
    }

    public async Task<JoinSummonResultDto> SummonOneAsync(
        Guid assemblyId,
        Guid targetUserId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsureCanSummon();

        var assembly = await RequireLiveAssemblyAsync(assemblyId, cancellationToken);
        var participant = await _db.AssemblyParticipants
            .FirstOrDefaultAsync(p => p.AssemblyId == assemblyId && p.UserId == targetUserId, cancellationToken)
            ?? throw new DomainException("PARTICIPANT_NOT_FOUND", "El participante no está en esta asamblea.");

        // "Ausente" for summon = not yet admitted into the live room.
        // Lobby/dashboard may hold a hub connection (and even Present attendance) without being in-room.
        if (participant.RoomEntryStatus == RoomEntryStatus.Admitted
            && IsInRoom(participant.AttendanceStatus))
        {
            var skipped = new JoinSummonResultDto(
                assemblyId,
                targetUserId,
                "SkippedConnected",
                "none",
                "El participante ya está conectado. No se envió un nuevo aviso.");
            await _realtime.PublishJoinSummonStatusAsync(assemblyId, skipped, cancellationToken);
            return skipped;
        }

        var key = $"{assemblyId:D}:{targetUserId:D}";
        var now = DateTimeOffset.UtcNow;
        if (LastSummonUtc.TryGetValue(key, out var last) && now - last < Cooldown)
        {
            var next = last + Cooldown;
            var cooled = new JoinSummonResultDto(
                assemblyId,
                targetUserId,
                "SkippedCooldown",
                "none",
                $"Espere {Math.Ceiling((next - now).TotalSeconds)} s antes de avisar de nuevo a esta persona.",
                next);
            await _realtime.PublishJoinSummonStatusAsync(assemblyId, cooled, cancellationToken);
            return cooled;
        }

        // Without an open platform session, SignalR cannot reach the person — try email fallback.
        if (!_hubPresence.IsHubConnected(assemblyId, targetUserId))
        {
            return await SummonOfflineViaEmailAsync(
                assembly,
                participant,
                key,
                now,
                cancellationToken);
        }

        var phName = await _db.PropertyHorizontals.AsNoTracking()
            .Where(p => p.Id == assembly.PropertyHorizontalId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? "Propiedad";

        var summonedBy = _currentTenant.DisplayName ?? "Administración";
        var dto = new JoinSummonDto(
            assemblyId,
            targetUserId,
            assembly.Title,
            phName,
            PresidentRequestMessage,
            summonedBy,
            now,
            "signalr",
            Guid.NewGuid());

        await _realtime.PublishJoinSummonAsync(assemblyId, dto, cancellationToken);
        LastSummonUtc[key] = now;

        await _audit.WriteAsync(
            AuditEventType.ParticipantJoinSummoned,
            assemblyId,
            metadata: new
            {
                TargetUserId = targetUserId,
                TargetDisplayName = participant.DisplayName,
                Channel = "signalr",
                Status = "Notified"
            },
            cancellationToken: cancellationToken);

        var notified = new JoinSummonResultDto(
            assemblyId,
            targetUserId,
            "Notified",
            "signalr",
            "Aviso enviado en tiempo real.");
        await _realtime.PublishJoinSummonStatusAsync(assemblyId, notified, cancellationToken);
        return notified;
    }

    public async Task<JoinSummonResultDto> ReportResponseAsync(
        Guid assemblyId,
        string status,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = _currentTenant.UserId
            ?? throw new DomainException("UNAUTHORIZED", "Debe iniciar sesión.");

        var normalized = (status ?? string.Empty).Trim();
        if (normalized is not ("Dismissed" or "Accepted" or "NoResponse"))
        {
            throw new DomainException("INVALID_STATUS", "Estado de respuesta no válido.");
        }

        await RequireLiveAssemblyAsync(assemblyId, cancellationToken);

        var detail = normalized switch
        {
            "Dismissed" => "El participante respondió: Ahora no.",
            "Accepted" => "El participante aceptó unirse.",
            _ => "Sin respuesta."
        };

        var dto = new JoinSummonResultDto(assemblyId, userId, normalized, "signalr", detail);
        await _realtime.PublishJoinSummonStatusAsync(assemblyId, dto, cancellationToken);
        await _audit.WriteAsync(
            AuditEventType.ParticipantJoinSummoned,
            assemblyId,
            metadata: new
            {
                TargetUserId = userId,
                Channel = "signalr",
                Status = normalized,
                Response = true
            },
            cancellationToken: cancellationToken);
        return dto;
    }

    public async Task<JoinSummonBatchResultDto> SummonAbsentAsync(
        Guid assemblyId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        EnsureCanSummon();
        await RequireLiveAssemblyAsync(assemblyId, cancellationToken);

        var participants = await _db.AssemblyParticipants.AsNoTracking()
            .Where(p => p.AssemblyId == assemblyId)
            .Select(p => new { p.UserId, p.AttendanceStatus })
            .ToListAsync(cancellationToken);

        var results = new List<JoinSummonResultDto>();
        var notified = 0;
        var skippedConnected = 0;
        var skippedCooldown = 0;
        var failed = 0;

        foreach (var p in participants)
        {
            try
            {
                var r = await SummonOneAsync(assemblyId, p.UserId, cancellationToken);
                results.Add(r);
                if (r.Status is "Notified" or "EmailSent" or "Delivered") notified++;
                else if (r.Status == "SkippedCooldown") skippedCooldown++;
                else if (r.Status == "SkippedConnected") skippedConnected++;
                else if (r.Status is "OfflineNoChannel" or "EmailFailed") failed++;
                else failed++;
            }
            catch (Exception)
            {
                failed++;
                results.Add(new JoinSummonResultDto(
                    assemblyId,
                    p.UserId,
                    "Error",
                    "none",
                    "No fue posible avisar a este participante."));
            }
        }

        return new JoinSummonBatchResultDto(
            assemblyId,
            participants.Count,
            notified,
            skippedConnected,
            skippedCooldown,
            failed,
            results);
    }

    private async Task<JoinSummonResultDto> SummonOfflineViaEmailAsync(
        Domain.Entities.Assembly assembly,
        AssemblyParticipant participant,
        string cooldownKey,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var assemblyId = assembly.Id;
        var targetUserId = participant.UserId;

        var email = await ResolveTargetEmailAsync(assemblyId, targetUserId, cancellationToken);
        var providerResolved = await TryResolveEmailProviderAsync(assembly.PropertyHorizontalId, cancellationToken);

        if (string.IsNullOrWhiteSpace(email) || providerResolved is null)
        {
            return await CompleteOfflineNoChannelAsync(
                assemblyId,
                targetUserId,
                participant.DisplayName,
                cooldownKey,
                now,
                cancellationToken);
        }

        var (convocation, recipient) = await FindConvocationRecipientAsync(
            assemblyId,
            targetUserId,
            email,
            cancellationToken);

        if (convocation is null || recipient is null)
        {
            return await CompleteOfflineNoChannelAsync(
                assemblyId,
                targetUserId,
                participant.DisplayName,
                cooldownKey,
                now,
                cancellationToken);
        }

        var (provider, usedSandbox, providerName) = providerResolved.Value;
        var issued = await _accessLinks.EnsureActiveLinkAsync(
            convocation,
            recipient,
            deliveryId: null,
            assembly.ScheduledAtUtc,
            assembly.EstimatedEndAtUtc,
            cancellationToken);

        var phName = await _db.PropertyHorizontals.AsNoTracking()
            .Where(p => p.Id == assembly.PropertyHorizontalId)
            .Select(p => p.Name)
            .FirstOrDefaultAsync(cancellationToken) ?? "Propiedad";

        ProviderSendResult sendResult;
        try
        {
            sendResult = await SendJoinSummonEmailAsync(
                provider,
                email.Trim(),
                participant.DisplayName,
                phName,
                assembly.Title,
                PresidentRequestMessage,
                issued.AbsoluteUrl,
                cancellationToken);
        }
        catch (Exception ex) when (ex is not DomainException)
        {
            sendResult = new ProviderSendResult(
                false,
                DeliveryStatus.Failed,
                null,
                ex.Message,
                usedSandbox);
        }

        LastSummonUtc[cooldownKey] = now;

        // Offline email must never claim SignalR "Notified".
        var status = !sendResult.Succeeded
            ? "EmailFailed"
            : sendResult.Status == DeliveryStatus.Delivered
                ? "Delivered"
                : "EmailSent";

        var detail = status switch
        {
            "Delivered" => "Correo de aviso entregado.",
            "EmailSent" => usedSandbox
                ? "Correo de aviso aceptado (sandbox / mock mailbox)."
                : "Correo de aviso enviado.",
            _ => "No fue posible enviar el correo de aviso."
        };

        await _audit.WriteAsync(
            AuditEventType.ParticipantJoinSummoned,
            assemblyId,
            metadata: new
            {
                TargetUserId = targetUserId,
                TargetDisplayName = participant.DisplayName,
                Channel = "email",
                Status = status,
                Provider = providerName,
                UsedSandbox = usedSandbox,
                ProviderMessageId = sendResult.ProviderMessageId,
                ProviderStatus = sendResult.Status.ToString(),
                AccessLinkId = issued.Link.Id
            },
            cancellationToken: cancellationToken);

        var result = new JoinSummonResultDto(
            assemblyId,
            targetUserId,
            status,
            "email",
            detail);
        await _realtime.PublishJoinSummonStatusAsync(assemblyId, result, cancellationToken);
        return result;
    }

    private async Task<JoinSummonResultDto> CompleteOfflineNoChannelAsync(
        Guid assemblyId,
        Guid targetUserId,
        string displayName,
        string cooldownKey,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var offline = new JoinSummonResultDto(
            assemblyId,
            targetUserId,
            "OfflineNoChannel",
            "none",
            OfflineNoChannelDetail);
        LastSummonUtc[cooldownKey] = now;
        await _audit.WriteAsync(
            AuditEventType.ParticipantJoinSummoned,
            assemblyId,
            metadata: new
            {
                TargetUserId = targetUserId,
                TargetDisplayName = displayName,
                Channel = "none",
                Status = "OfflineNoChannel"
            },
            cancellationToken: cancellationToken);
        await _realtime.PublishJoinSummonStatusAsync(assemblyId, offline, cancellationToken);
        return offline;
    }

    private async Task<string?> ResolveTargetEmailAsync(
        Guid assemblyId,
        Guid targetUserId,
        CancellationToken cancellationToken)
    {
        var fromIdentity = await _identity.GetEmailByUserIdAsync(targetUserId, cancellationToken);
        if (!string.IsNullOrWhiteSpace(fromIdentity))
        {
            return fromIdentity.Trim();
        }

        var fromOwner = await _db.Owners.AsNoTracking()
            .Where(o => o.UserId == targetUserId && o.Email != null && o.Email != string.Empty)
            .Select(o => o.Email)
            .FirstOrDefaultAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(fromOwner))
        {
            return fromOwner.Trim();
        }

        var ownerIds = await _db.Owners.AsNoTracking()
            .Where(o => o.UserId == targetUserId)
            .Select(o => o.Id)
            .ToListAsync(cancellationToken);

        var fromRecipient = await (
            from r in _db.ConvocationRecipients.AsNoTracking()
            join c in _db.Convocations.AsNoTracking() on r.ConvocationId equals c.Id
            where c.AssemblyId == assemblyId
                  && r.IsValid
                  && r.Email != null
                  && r.Email != string.Empty
                  && (r.UserId == targetUserId
                      || (r.OwnerId != null && ownerIds.Contains(r.OwnerId.Value)))
            orderby c.SentAtUtc descending, c.Version descending
            select r.Email)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrWhiteSpace(fromRecipient) ? null : fromRecipient.Trim();
    }

    private async Task<(IEmailProvider Provider, bool UsedSandbox, string ProviderName)?> TryResolveEmailProviderAsync(
        Guid propertyHorizontalId,
        CancellationToken cancellationToken)
    {
        var system = await _communications.TryResolvePhEmailProviderSystemAsync(
            propertyHorizontalId,
            cancellationToken);
        if (system is not null)
        {
            var (provider, usedSandbox, name) = system.Value;
            if (IsUsableEmailProvider(usedSandbox, name))
            {
                return system;
            }
        }

        try
        {
            var resolved = await _communications.ResolvePhEmailProviderAsync(
                propertyHorizontalId,
                cancellationToken);
            if (IsUsableEmailProvider(resolved.UsedSandbox, resolved.ProviderName))
            {
                return resolved;
            }
        }
        catch (DomainException)
        {
            return null;
        }

        return null;
    }

    private bool IsUsableEmailProvider(bool usedSandbox, string providerName)
    {
        // Production without real SMTP must stay OfflineNoChannel (never pretend email was sent).
        if (string.Equals(providerName, "Mock", StringComparison.OrdinalIgnoreCase)
            && !usedSandbox
            && !_communications.AllowsMockInvitations)
        {
            return false;
        }

        return true;
    }

    private async Task<(Convocation? Convocation, ConvocationRecipient? Recipient)> FindConvocationRecipientAsync(
        Guid assemblyId,
        Guid targetUserId,
        string email,
        CancellationToken cancellationToken)
    {
        var convocations = await _db.Convocations
            .Where(c => c.AssemblyId == assemblyId && c.Status != ConvocationStatus.Cancelled)
            .OrderByDescending(c => c.SentAtUtc)
            .ThenByDescending(c => c.Version)
            .ToListAsync(cancellationToken);

        if (convocations.Count == 0)
        {
            return (null, null);
        }

        var ownerIds = await _db.Owners.AsNoTracking()
            .Where(o => o.UserId == targetUserId)
            .Select(o => o.Id)
            .ToListAsync(cancellationToken);

        var convocationIds = convocations.Select(c => c.Id).ToList();
        var recipients = await _db.ConvocationRecipients
            .Where(r => convocationIds.Contains(r.ConvocationId) && r.IsValid)
            .ToListAsync(cancellationToken);

        foreach (var convocation in convocations)
        {
            var forConv = recipients.Where(r => r.ConvocationId == convocation.Id).ToList();
            var match =
                forConv.FirstOrDefault(r => r.UserId == targetUserId)
                ?? forConv.FirstOrDefault(r =>
                    r.OwnerId is Guid oid && ownerIds.Contains(oid))
                ?? forConv.FirstOrDefault(r =>
                    !string.IsNullOrWhiteSpace(r.Email)
                    && string.Equals(r.Email.Trim(), email, StringComparison.OrdinalIgnoreCase));

            if (match is not null)
            {
                return (convocation, match);
            }
        }

        return (null, null);
    }

    private static async Task<ProviderSendResult> SendJoinSummonEmailAsync(
        IEmailProvider emailProvider,
        string email,
        string displayName,
        string phName,
        string assemblyTitle,
        string requestMessage,
        string joinUrl,
        CancellationToken cancellationToken)
    {
        var subject = $"Unirse ahora — {assemblyTitle}";
        var safeName = WebUtility.HtmlEncode(displayName);
        var safePh = WebUtility.HtmlEncode(phName);
        var safeTitle = WebUtility.HtmlEncode(assemblyTitle);
        var safeMsg = WebUtility.HtmlEncode(requestMessage);
        var safeUrl = WebUtility.HtmlEncode(joinUrl);

        var text =
            $"Hola {displayName},\n\n{requestMessage}\n\n" +
            $"Propiedad: {phName}\nAsamblea: {assemblyTitle}\n\n" +
            $"Unirme ahora:\n{joinUrl}\n\n" +
            "Si no esperabas este aviso, puedes ignorar este mensaje.";

        var html =
            $"""
            <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">
              <p style="letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:#666">ASAMBLEAS</p>
              <h1 style="font-size:22px;margin:0 0 12px">Aviso para unirse</h1>
              <p>Hola {safeName},</p>
              <p>{safeMsg}</p>
              <p><strong>{safeTitle}</strong><br /><span style="color:#555">{safePh}</span></p>
              <p style="margin:28px 0">
                <a href="{safeUrl}"
                   style="display:inline-block;background:#0f3d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">
                  Unirme ahora
                </a>
              </p>
              <p style="font-size:13px;color:#555;word-break:break-all">
                Si el botón no abre bien, copia y pega este enlace:<br />
                <a href="{safeUrl}" style="color:#0f3d2e">{safeUrl}</a>
              </p>
            </div>
            """;

        return await emailProvider.SendAsync(
            new EmailMessage(email, displayName, subject, html, text, null, null, null, null),
            cancellationToken);
    }

    private void EnsureCanSummon()
    {
        var perms = _currentTenant.Permissions;
        if (perms.Contains(Permissions.MeetingModerate)
            || perms.Contains(Permissions.AssemblyManage)
            || perms.Contains(Permissions.AssemblyStart)
            || perms.Contains(Permissions.AttendanceManage))
        {
            return;
        }

        throw new DomainException("FORBIDDEN", "No tiene permiso para avisar participantes.");
    }

    private async Task<Domain.Entities.Assembly> RequireLiveAssemblyAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");

        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);

        if (assembly.Status is not (AssemblyStatus.CheckIn or AssemblyStatus.InProgress or AssemblyStatus.Paused))
        {
            throw new DomainException(
                "ASSEMBLY_NOT_JOINABLE",
                "Solo puede avisar participantes mientras la mesa o la asamblea estén abiertas.");
        }

        return assembly;
    }

    private static bool IsInRoom(AttendanceStatus status) =>
        status is AttendanceStatus.Present or AttendanceStatus.CheckedIn;
}
