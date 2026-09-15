namespace Asambleas.Application.Meeting;

using System.Collections.Concurrent;
using System.Net;
using System.Text.RegularExpressions;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Application.Security;
using Asambleas.Contracts.Realtime;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Assembly chat. Informal only — never a vote, power, accreditation, or legal decision.
/// </summary>
public sealed class AssemblyChatService
{
    private const int MaxLength = 1000;
    private static readonly TimeSpan RateWindow = TimeSpan.FromSeconds(10);
    private static readonly ConcurrentDictionary<string, ConcurrentQueue<DateTimeOffset>> RateBuckets = new();

    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;
    private readonly IAssemblyRealtimePublisher _realtime;
    private readonly IAuditService _audit;

    public AssemblyChatService(
        IAsambleasDbContext db,
        ICurrentTenant currentTenant,
        IAssemblyRealtimePublisher realtime,
        IAuditService audit)
    {
        _db = db;
        _currentTenant = currentTenant;
        _realtime = realtime;
        _audit = audit;
    }

    public async Task<IReadOnlyList<AssemblyChatMessageDto>> ListAsync(
        Guid assemblyId,
        int take = 100,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        await EnsureAssemblyAsync(assemblyId, cancellationToken);
        take = Math.Clamp(take, 1, 200);

        var rows = await _db.AssemblyChatMessages.AsNoTracking()
            .Where(m => m.AssemblyId == assemblyId && !m.IsRemoved)
            .OrderByDescending(m => m.IsPinned)
            .ThenByDescending(m => m.CreatedAtUtc)
            .Take(take)
            .ToListAsync(cancellationToken);

        return rows
            .OrderBy(m => m.CreatedAtUtc)
            .Select(ToDto)
            .ToList();
    }

    public async Task<AssemblyChatMessageDto> PostAsync(
        Guid assemblyId,
        string body,
        bool asAnnouncement = false,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        var userId = _currentTenant.UserId
            ?? throw new DomainException("UNAUTHORIZED", "Debe iniciar sesión.");
        var assembly = await EnsureAssemblyAsync(assemblyId, cancellationToken);

        EnsureRateLimit(assemblyId, userId);

        var text = Sanitize(body);
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new DomainException("CHAT_EMPTY", "El mensaje no puede estar vacío.");
        }

        if (text.Length > MaxLength)
        {
            throw new DomainException("CHAT_TOO_LONG", $"El mensaje no puede superar {MaxLength} caracteres.");
        }

        var isMod = IsModerator();
        var kind = asAnnouncement
            ? (isMod ? "Announcement" : throw new DomainException("FORBIDDEN", "Solo la mesa puede fijar anuncios."))
            : isMod ? "President" : "Participant";

        var entity = new AssemblyChatMessage
        {
            TenantId = assembly.TenantId,
            AssemblyId = assemblyId,
            AuthorUserId = userId,
            AuthorDisplayName = _currentTenant.DisplayName ?? "Participante",
            Kind = kind,
            Body = text,
            IsPinned = asAnnouncement && isMod,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        _db.AssemblyChatMessages.Add(entity);
        await _db.SaveChangesAsync(cancellationToken);

        var dto = ToDto(entity);
        await _realtime.PublishChatMessageAsync(assemblyId, dto, cancellationToken);
        return dto;
    }

    public async Task RemoveAsync(
        Guid assemblyId,
        Guid messageId,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        if (!IsModerator())
        {
            throw new DomainException("FORBIDDEN", "Solo la mesa puede eliminar mensajes.");
        }

        await EnsureAssemblyAsync(assemblyId, cancellationToken);
        var msg = await _db.AssemblyChatMessages
            .FirstOrDefaultAsync(m => m.Id == messageId && m.AssemblyId == assemblyId, cancellationToken)
            ?? throw new DomainException("CHAT_NOT_FOUND", "Mensaje no encontrado.");

        msg.IsRemoved = true;
        msg.RemovedByUserId = _currentTenant.UserId;
        msg.RemovedAtUtc = DateTimeOffset.UtcNow;
        msg.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        await _realtime.PublishChatMessageRemovedAsync(assemblyId, messageId, cancellationToken);
        await _audit.WriteAsync(
            "CHAT_MESSAGE_REMOVED",
            assemblyId,
            metadata: new { MessageId = messageId },
            cancellationToken: cancellationToken);
    }

    private static AssemblyChatMessageDto ToDto(AssemblyChatMessage m) =>
        new(m.Id, m.AssemblyId, m.AuthorUserId, m.AuthorDisplayName, m.Kind, m.Body, m.CreatedAtUtc, m.IsPinned);

    private static string Sanitize(string? body)
    {
        if (string.IsNullOrWhiteSpace(body)) return string.Empty;
        var decoded = WebUtility.HtmlDecode(body).Trim();
        // Strip tags — chat is plain text only.
        return Regex.Replace(decoded, "<.*?>", string.Empty, RegexOptions.Singleline);
    }

    private void EnsureRateLimit(Guid assemblyId, Guid userId)
    {
        var key = $"{assemblyId:D}:{userId:D}";
        var q = RateBuckets.GetOrAdd(key, static _ => new ConcurrentQueue<DateTimeOffset>());
        var now = DateTimeOffset.UtcNow;
        while (q.TryPeek(out var old) && now - old > RateWindow)
        {
            q.TryDequeue(out _);
        }

        if (q.Count >= 5)
        {
            throw new DomainException("CHAT_RATE_LIMIT", "Demasiados mensajes. Espere unos segundos.");
        }

        q.Enqueue(now);
    }

    private bool IsModerator()
    {
        var p = _currentTenant.Permissions;
        return p.Contains(Permissions.MeetingModerate)
            || p.Contains(Permissions.AssemblyManage)
            || p.Contains(Permissions.AssemblyStart);
    }

    private async Task<Domain.Entities.Assembly> EnsureAssemblyAsync(
        Guid assemblyId,
        CancellationToken cancellationToken)
    {
        var assembly = await _db.Assemblies
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == assemblyId, cancellationToken)
            ?? throw new DomainException($"Assembly '{assemblyId}' was not found.");
        TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
        return assembly;
    }
}
