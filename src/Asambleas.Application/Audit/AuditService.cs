namespace Asambleas.Application.Audit;

using Asambleas.Application.Abstractions;
using Asambleas.Application.Common;
using Asambleas.Contracts.Audit;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Microsoft.EntityFrameworkCore;

public sealed class AuditService : IAuditService
{
    private readonly IAsambleasDbContext _db;
    private readonly ICurrentTenant _currentTenant;

    public AuditService(IAsambleasDbContext db, ICurrentTenant currentTenant)
    {
        _db = db;
        _currentTenant = currentTenant;
    }

    public async Task WriteAsync(
        string eventType,
        Guid? assemblyId = null,
        Guid? correlationId = null,
        object? metadata = null,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);
        ArgumentException.ThrowIfNullOrWhiteSpace(eventType);

        Guid? propertyHorizontalId = _currentTenant.PropertyHorizontalId;
        Guid? organizationId = _currentTenant.OrganizationId;

        if (assemblyId is Guid aid)
        {
            var assembly = await _db.Assemblies
                .AsNoTracking()
                .Where(a => a.Id == aid)
                .Select(a => new { a.TenantId, a.PropertyHorizontalId })
                .FirstOrDefaultAsync(cancellationToken);

            if (assembly is not null)
            {
                TenantGuard.EnsureTenantMatch(_currentTenant, assembly.TenantId);
                propertyHorizontalId ??= assembly.PropertyHorizontalId;

                if (organizationId is null)
                {
                    organizationId = await _db.PropertyHorizontals
                        .AsNoTracking()
                        .Where(p => p.Id == assembly.PropertyHorizontalId)
                        .Select(p => (Guid?)p.OrganizationId)
                        .FirstOrDefaultAsync(cancellationToken);
                }
            }
        }

        var auditEvent = new AuditEvent
        {
            TenantId = _currentTenant.TenantId,
            OrganizationId = organizationId,
            PropertyHorizontalId = propertyHorizontalId,
            AssemblyId = assemblyId,
            UserId = _currentTenant.UserId,
            EventType = eventType,
            CorrelationId = correlationId ?? Guid.NewGuid(),
            OccurredAtUtc = DateTimeOffset.UtcNow,
            MetadataJson = Mapping.ToJson(metadata)
        };

        _db.AuditEvents.Add(auditEvent);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task WriteSystemAsync(
        Guid tenantId,
        string eventType,
        Guid? propertyHorizontalId = null,
        Guid? correlationId = null,
        Guid? userId = null,
        object? metadata = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(eventType);
        if (tenantId == Guid.Empty)
        {
            throw new DomainException("TENANT_REQUIRED", "Tenant id is required for system audit events.");
        }

        Guid? organizationId = null;
        if (propertyHorizontalId is Guid phId)
        {
            organizationId = await _db.PropertyHorizontals
                .IgnoreQueryFilters()
                .AsNoTracking()
                .Where(p => p.Id == phId)
                .Select(p => (Guid?)p.OrganizationId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        var auditEvent = new AuditEvent
        {
            TenantId = tenantId,
            OrganizationId = organizationId,
            PropertyHorizontalId = propertyHorizontalId,
            AssemblyId = null,
            UserId = userId,
            EventType = eventType,
            CorrelationId = correlationId ?? Guid.NewGuid(),
            OccurredAtUtc = DateTimeOffset.UtcNow,
            MetadataJson = Mapping.ToJson(metadata)
        };

        _db.AuditEvents.Add(auditEvent);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<AuditEventPageDto> QueryAsync(
        AuditEventQuery query,
        CancellationToken cancellationToken = default)
    {
        TenantGuard.EnsureAuthenticated(_currentTenant);

        var take = query.Take <= 0 ? 50 : Math.Min(query.Take, 200);
        var skip = Math.Max(query.Skip, 0);

        if (query.AssemblyId is Guid assemblyId)
        {
            var assemblyTenantId = await _db.Assemblies
                .AsNoTracking()
                .Where(a => a.Id == assemblyId)
                .Select(a => (Guid?)a.TenantId)
                .FirstOrDefaultAsync(cancellationToken);

            if (assemblyTenantId is null)
            {
                throw new DomainException($"Assembly '{assemblyId}' was not found.");
            }

            TenantGuard.EnsureTenantMatch(_currentTenant, assemblyTenantId.Value);
        }

        var source = _db.AuditEvents
            .AsNoTracking()
            .Where(e => e.TenantId == _currentTenant.TenantId);

        if (query.AssemblyId is Guid scopedAssemblyId)
        {
            source = source.Where(e => e.AssemblyId == scopedAssemblyId);
        }

        if (!string.IsNullOrWhiteSpace(query.EventType))
        {
            source = source.Where(e => e.EventType == query.EventType);
        }

        if (query.FromUtc is DateTimeOffset fromUtc)
        {
            source = source.Where(e => e.OccurredAtUtc >= fromUtc);
        }

        if (query.ToUtc is DateTimeOffset toUtc)
        {
            source = source.Where(e => e.OccurredAtUtc <= toUtc);
        }

        var total = await source.CountAsync(cancellationToken);

        var items = await source
            .OrderByDescending(e => e.OccurredAtUtc)
            .Skip(skip)
            .Take(take)
            .Select(e => new AuditEventDto(
                e.Id,
                e.TenantId,
                e.OrganizationId,
                e.PropertyHorizontalId,
                e.AssemblyId,
                e.UserId,
                e.EventType,
                e.CorrelationId,
                e.OccurredAtUtc,
                e.MetadataJson))
            .ToListAsync(cancellationToken);

        return new AuditEventPageDto(total, items);
    }
}
