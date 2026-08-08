namespace Asambleas.Infrastructure.Seed;

using Asambleas.Application.Security;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Identity;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using AssemblyEntity = Asambleas.Domain.Entities.Assembly;

public sealed class DemoDataSeeder
{
    private readonly AsambleasDbContext _db;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<ApplicationRole> _roleManager;
    private readonly CurrentTenant _currentTenant;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<DemoDataSeeder> _logger;

    public DemoDataSeeder(
        AsambleasDbContext db,
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        CurrentTenant currentTenant,
        IHostEnvironment environment,
        ILogger<DemoDataSeeder> logger)
    {
        _db = db;
        _userManager = userManager;
        _roleManager = roleManager;
        _currentTenant = currentTenant;
        _environment = environment;
        _logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (_environment.IsProduction())
        {
            _logger.LogInformation("Skipping demo seed in Production.");
            return;
        }

        if (!_environment.IsDevelopment())
        {
            _logger.LogInformation(
                "Skipping demo user passwords outside Development (Environment={Environment}).",
                _environment.EnvironmentName);
        }

        await EnsureRolesAsync(cancellationToken);

        if (await _db.Tenants.IgnoreQueryFilters().AnyAsync(t => t.Id == DemoSeedConstants.TenantOceanId, cancellationToken))
        {
            _logger.LogInformation("Demo seed already present; skipping.");
            return;
        }

        await SeedTenantOceanAsync(cancellationToken);
        await SeedTenantOtherAsync(cancellationToken);

        if (_environment.IsDevelopment())
        {
            await SeedUsersAsync(cancellationToken);
        }
        else
        {
            _logger.LogWarning("Demo users were not created because environment is not Development.");
        }

        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Demo seed completed (tenants OCEAN + OTHERPH).");
    }

    private async Task EnsureRolesAsync(CancellationToken cancellationToken)
    {
        foreach (var roleName in Roles.All)
        {
            if (await _roleManager.RoleExistsAsync(roleName))
            {
                continue;
            }

            var role = new ApplicationRole
            {
                Id = Guid.NewGuid(),
                Name = roleName,
                NormalizedName = roleName.ToUpperInvariant()
            };

            var result = await _roleManager.CreateAsync(role);
            if (!result.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Failed to create role '{roleName}': {string.Join(", ", result.Errors.Select(e => e.Description))}");
            }

            foreach (var permission in RolePermissionMap.GetPermissions(roleName))
            {
                await _roleManager.AddClaimAsync(
                    role,
                    new System.Security.Claims.Claim(DemoSeedConstants.PermissionClaimType, permission));
            }
        }

        cancellationToken.ThrowIfCancellationRequested();
    }

    private async Task SeedTenantOceanAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;

        _db.Tenants.Add(new Tenant
        {
            Id = DemoSeedConstants.TenantOceanId,
            Code = "OCEAN",
            Name = "Ocean Tower Demo Tenant",
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        _db.Organizations.Add(new Organization
        {
            Id = DemoSeedConstants.OrgOceanId,
            TenantId = DemoSeedConstants.TenantOceanId,
            Code = "OCEAN-ORG",
            Name = "Ocean Tower Organization",
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        _db.PropertyHorizontals.Add(new PropertyHorizontal
        {
            Id = DemoSeedConstants.PhOceanId,
            TenantId = DemoSeedConstants.TenantOceanId,
            OrganizationId = DemoSeedConstants.OrgOceanId,
            Code = "OCEAN-PH",
            Name = "PH DEMO OCEAN TOWER",
            TimeZoneId = "America/Bogota",
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        foreach (var (code, coefficient, id) in DemoSeedConstants.OceanUnits)
        {
            _db.Units.Add(new Unit
            {
                Id = id,
                TenantId = DemoSeedConstants.TenantOceanId,
                PropertyHorizontalId = DemoSeedConstants.PhOceanId,
                Code = code,
                CoefficientPercent = coefficient,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        _db.Assemblies.Add(new AssemblyEntity
        {
            Id = DemoSeedConstants.AssemblyOceanId,
            TenantId = DemoSeedConstants.TenantOceanId,
            PropertyHorizontalId = DemoSeedConstants.PhOceanId,
            Title = "ASAMBLEA GENERAL ORDINARIA — PH OCEAN TOWER",
            Modality = AssemblyEntity.ModalityVirtual,
            Status = AssemblyStatus.Scheduled,
            ScheduledAtUtc = now.AddDays(1),
            RequiredQuorumPercent = 50.00m,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        var agenda = new[]
        {
            (DemoSeedConstants.Agenda01Id, 1, "01", "Verificación de quórum e instalación"),
            (DemoSeedConstants.Agenda02Id, 2, "02", "Lectura y aprobación del orden del día"),
            (DemoSeedConstants.Agenda03Id, 3, "03", "Aprobación del presupuesto anual"),
            (DemoSeedConstants.Agenda04Id, 4, "04", "Proposiciones y varios")
        };

        foreach (var (id, ordinal, code, title) in agenda)
        {
            _db.AgendaItems.Add(new AgendaItem
            {
                Id = id,
                TenantId = DemoSeedConstants.TenantOceanId,
                AssemblyId = DemoSeedConstants.AssemblyOceanId,
                Ordinal = ordinal,
                Code = code,
                Title = title,
                IsActive = false,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        _db.Motions.Add(new Motion
        {
            Id = DemoSeedConstants.Motion001Id,
            TenantId = DemoSeedConstants.TenantOceanId,
            AssemblyId = DemoSeedConstants.AssemblyOceanId,
            AgendaItemId = DemoSeedConstants.Agenda03Id,
            Code = "MOTION-001",
            Title = "Aprobar presupuesto de gastos comunes 2026",
            Body = "Se somete a consideración la aprobación del presupuesto anual de gastos comunes para la vigencia 2026.",
            Status = MotionStatus.Draft,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedTenantOtherAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;

        _db.Tenants.Add(new Tenant
        {
            Id = DemoSeedConstants.TenantOtherId,
            Code = "OTHERPH",
            Name = "Other PH Isolation Tenant",
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        _db.Organizations.Add(new Organization
        {
            Id = DemoSeedConstants.OrgOtherId,
            TenantId = DemoSeedConstants.TenantOtherId,
            Code = "OTHER-ORG",
            Name = "Other Organization",
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        _db.PropertyHorizontals.Add(new PropertyHorizontal
        {
            Id = DemoSeedConstants.PhOtherId,
            TenantId = DemoSeedConstants.TenantOtherId,
            OrganizationId = DemoSeedConstants.OrgOtherId,
            Code = "OTHER-PH",
            Name = "PH OTHER ISOLATION",
            TimeZoneId = "America/Bogota",
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        _db.Units.Add(new Unit
        {
            Id = DemoSeedConstants.UnitOtherId,
            TenantId = DemoSeedConstants.TenantOtherId,
            PropertyHorizontalId = DemoSeedConstants.PhOtherId,
            Code = "A-01",
            CoefficientPercent = 100.00m,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        _db.Assemblies.Add(new AssemblyEntity
        {
            Id = DemoSeedConstants.AssemblyOtherId,
            TenantId = DemoSeedConstants.TenantOtherId,
            PropertyHorizontalId = DemoSeedConstants.PhOtherId,
            Title = "ASAMBLEA AISLAMIENTO — PH OTHER",
            Modality = AssemblyEntity.ModalityVirtual,
            Status = AssemblyStatus.Scheduled,
            ScheduledAtUtc = now.AddDays(2),
            RequiredQuorumPercent = 50.00m,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task SeedUsersAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;

        var users = new[]
        {
            (DemoSeedConstants.UserPresidentId, "president", "president@ocean.demo", "Presidente Asamblea", Roles.AssemblyPresident, DemoSeedConstants.Unit107Id, DemoSeedConstants.OwnerPresidentId),
            (DemoSeedConstants.UserSecretaryId, "secretary", "secretary@ocean.demo", "Secretario Asamblea", Roles.AssemblySecretary, DemoSeedConstants.Unit108Id, DemoSeedConstants.OwnerSecretaryId),
            (DemoSeedConstants.UserOwner101Id, "owner101", "owner101@ocean.demo", "Propietario 101", Roles.Owner, DemoSeedConstants.Unit101Id, DemoSeedConstants.Owner101Id),
            (DemoSeedConstants.UserOwner102Id, "owner102", "owner102@ocean.demo", "Propietario 102", Roles.Owner, DemoSeedConstants.Unit102Id, DemoSeedConstants.Owner102Id),
            (DemoSeedConstants.UserOwner103Id, "owner103", "owner103@ocean.demo", "Propietario 103", Roles.Owner, DemoSeedConstants.Unit103Id, DemoSeedConstants.Owner103Id),
            (DemoSeedConstants.UserOwner104Id, "owner104", "owner104@ocean.demo", "Propietario 104", Roles.Owner, DemoSeedConstants.Unit104Id, DemoSeedConstants.Owner104Id),
            (DemoSeedConstants.UserOwner105Id, "owner105", "owner105@ocean.demo", "Propietario 105", Roles.Owner, DemoSeedConstants.Unit105Id, DemoSeedConstants.Owner105Id),
            (DemoSeedConstants.UserOwner106Id, "owner106", "owner106@ocean.demo", "Propietario 106", Roles.Owner, DemoSeedConstants.Unit106Id, DemoSeedConstants.Owner106Id)
        };

        // Bypass tenant filter while creating Identity users (login lookup needs unfiltered access).
        _currentTenant.TenantId = Guid.Empty;

        foreach (var (userId, userName, email, displayName, role, unitId, ownerId) in users)
        {
            var existing = await _userManager.FindByIdAsync(userId.ToString());
            if (existing is not null)
            {
                continue;
            }

            var user = new ApplicationUser
            {
                Id = userId,
                UserName = userName,
                Email = email,
                EmailConfirmed = true,
                TenantId = DemoSeedConstants.TenantOceanId,
                OrganizationId = DemoSeedConstants.OrgOceanId,
                DisplayName = displayName,
                DemoRole = role
            };

            var createResult = await _userManager.CreateAsync(user, DemoSeedConstants.DemoPassword);
            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Failed to create user '{userName}': {string.Join(", ", createResult.Errors.Select(e => e.Description))}");
            }

            await _userManager.AddToRoleAsync(user, role);

            foreach (var permission in RolePermissionMap.GetPermissions(role))
            {
                await _userManager.AddClaimAsync(
                    user,
                    new System.Security.Claims.Claim(DemoSeedConstants.PermissionClaimType, permission));
            }

            _db.Owners.Add(new Owner
            {
                Id = ownerId,
                TenantId = DemoSeedConstants.TenantOceanId,
                DisplayName = displayName,
                Email = email,
                UserId = userId,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });

            _db.Ownerships.Add(new Ownership
            {
                Id = Guid.NewGuid(),
                TenantId = DemoSeedConstants.TenantOceanId,
                UnitId = unitId,
                OwnerId = ownerId,
                SharePercent = 100.00m,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });

            _db.AssemblyParticipants.Add(new AssemblyParticipant
            {
                Id = Guid.NewGuid(),
                TenantId = DemoSeedConstants.TenantOceanId,
                AssemblyId = DemoSeedConstants.AssemblyOceanId,
                UserId = userId,
                UnitId = unitId,
                DisplayName = displayName,
                RoleCode = role,
                AttendanceStatus = AttendanceStatus.Registered,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
    }
}
