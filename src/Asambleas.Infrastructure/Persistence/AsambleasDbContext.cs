namespace Asambleas.Infrastructure.Persistence;

using Asambleas.Application.Abstractions;
using Asambleas.Domain.Common;
using Asambleas.Domain.Entities;
using Asambleas.Infrastructure.Identity;
using Asambleas.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

public sealed class AsambleasDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>, IAsambleasDbContext
{
    private readonly ICurrentTenant _currentTenant;

    public AsambleasDbContext(DbContextOptions<AsambleasDbContext> options, ICurrentTenant currentTenant)
        : base(options)
    {
        _currentTenant = currentTenant;
    }

    public DbSet<Tenant> Tenants => Set<Tenant>();

    public DbSet<Organization> Organizations => Set<Organization>();

    public DbSet<PropertyHorizontal> PropertyHorizontals => Set<PropertyHorizontal>();

    public DbSet<Unit> Units => Set<Unit>();

    public DbSet<Owner> Owners => Set<Owner>();

    public DbSet<Ownership> Ownerships => Set<Ownership>();

    public DbSet<AssemblyEntity> Assemblies => Set<AssemblyEntity>();

    public DbSet<AssemblyParticipant> AssemblyParticipants => Set<AssemblyParticipant>();

    public DbSet<AttendanceRecord> AttendanceRecords => Set<AttendanceRecord>();

    public DbSet<AgendaItem> AgendaItems => Set<AgendaItem>();

    public DbSet<Motion> Motions => Set<Motion>();

    public DbSet<VotingSession> VotingSessions => Set<VotingSession>();

    public DbSet<Vote> Votes => Set<Vote>();

    public DbSet<QuorumSnapshot> QuorumSnapshots => Set<QuorumSnapshot>();

    public DbSet<SpeakerRequest> SpeakerRequests => Set<SpeakerRequest>();

    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(AsambleasDbContext).Assembly);
        ApplyTenantQueryFilters(builder);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var utcNow = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries<Entity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAtUtc = utcNow;
                entry.Entity.UpdatedAtUtc = utcNow;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAtUtc = utcNow;
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }

    private void ApplyTenantQueryFilters(ModelBuilder builder)
    {
        // When TenantId is empty (design-time / unauthenticated), filters match nothing for tenant-scoped rows.
        // Seed and migrations use IgnoreQueryFilters() or set CurrentTenant explicitly.
        builder.Entity<Organization>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<PropertyHorizontal>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<Unit>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<Owner>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<Ownership>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<AssemblyEntity>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<AssemblyParticipant>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<AttendanceRecord>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<AgendaItem>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<Motion>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<VotingSession>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<Vote>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<QuorumSnapshot>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<SpeakerRequest>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);
        builder.Entity<AuditEvent>().HasQueryFilter(e => e.TenantId == _currentTenant.TenantId);

        // Allow unfiltered user lookup when tenant is not yet resolved (login / design-time).
        builder.Entity<ApplicationUser>().HasQueryFilter(e =>
            _currentTenant.TenantId == Guid.Empty || e.TenantId == _currentTenant.TenantId);
    }
}
