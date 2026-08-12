namespace Asambleas.Infrastructure.Seed;

using Asambleas.Application.Security;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Identity;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
    private readonly IConfiguration _configuration;
    private readonly ILogger<DemoDataSeeder> _logger;

    public DemoDataSeeder(
        AsambleasDbContext db,
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        CurrentTenant currentTenant,
        IHostEnvironment environment,
        IConfiguration configuration,
        ILogger<DemoDataSeeder> logger)
    {
        _db = db;
        _userManager = userManager;
        _roleManager = roleManager;
        _currentTenant = currentTenant;
        _environment = environment;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var seedUsers = _environment.IsDevelopment()
            || _configuration.GetValue("Demo:SeedUsers", false);

        if (_environment.IsProduction() && !seedUsers)
        {
            _logger.LogInformation("Skipping demo seed in Production (Demo:SeedUsers not enabled).");
            return;
        }

        if (!seedUsers)
        {
            _logger.LogInformation(
                "Seeding tenants/roles only (users skipped). Environment={Environment}.",
                _environment.EnvironmentName);
        }

        await EnsureRolesAsync(cancellationToken);

        if (await _db.Tenants.IgnoreQueryFilters().AnyAsync(t => t.Id == DemoSeedConstants.TenantOceanId, cancellationToken))
        {
            _logger.LogInformation("Demo seed already present; ensuring EO-006 powers and PH memberships.");
            if (seedUsers)
            {
                await SeedUsersAsync(cancellationToken);
                await EnsureEo006PowersAsync(cancellationToken);
                await EnsureUserPropertyMembershipsAsync(cancellationToken);
                await RotateDemoUserPasswordsAsync(cancellationToken);
            }

            return;
        }

        await SeedTenantOceanAsync(cancellationToken);
        await SeedTenantOtherAsync(cancellationToken);

        if (seedUsers)
        {
            await SeedUsersAsync(cancellationToken);
        }
        else
        {
            _logger.LogWarning("Demo users were not created (Demo:SeedUsers=false).");
        }

        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("Demo seed completed (tenants OCEAN + OTHERPH).");
    }

    private async Task RotateDemoUserPasswordsAsync(CancellationToken cancellationToken)
    {
        if (!_configuration.GetValue("Demo:RotatePasswords", false)
            && !_configuration.GetValue("Demo:SeedUsers", false))
        {
            return;
        }

        var password = DemoPasswordResolver.ResolveRequired(_configuration);
        var emails = DemoUsersCatalogEmails();
        var rotated = 0;
        foreach (var email in emails)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var user = await _userManager.FindByEmailAsync(email);
            if (user is null)
            {
                continue;
            }

            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            var result = await _userManager.ResetPasswordAsync(user, token, password);
            if (!result.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Failed to rotate password for demo user: {string.Join(", ", result.Errors.Select(e => e.Description))}");
            }

            rotated++;
        }

        _logger.LogInformation("Demo user passwords rotated for {Count} accounts (value not logged).", rotated);
    }

    private static IReadOnlyList<string> DemoUsersCatalogEmails() =>
    [
        "president@ocean.demo",
        "secretary@ocean.demo",
        "phadmin@ocean.demo",
        "owner101@ocean.demo",
        "owner102@ocean.demo",
        "owner103@ocean.demo",
        "owner104@ocean.demo",
        "owner105@ocean.demo",
        "owner106@ocean.demo"
    ];

    private async Task EnsureRolesAsync(CancellationToken cancellationToken)
    {
        foreach (var roleName in Roles.All)
        {
            ApplicationRole? role;
            if (await _roleManager.RoleExistsAsync(roleName))
            {
                role = await _roleManager.FindByNameAsync(roleName);
            }
            else
            {
                role = new ApplicationRole
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
            }

            if (role is null)
            {
                continue;
            }

            // Keep AspNetRoleClaims in sync with RolePermissionMap (source of truth is still the map at login).
            var existing = await _roleManager.GetClaimsAsync(role);
            foreach (var claim in existing.Where(c =>
                         string.Equals(c.Type, DemoSeedConstants.PermissionClaimType, StringComparison.Ordinal)))
            {
                await _roleManager.RemoveClaimAsync(role, claim);
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
            LegalName = "Propiedad Horizontal Demo Ocean Tower",
            Country = "Panamá",
            City = "Panamá",
            TimeZoneId = "America/Panama",
            AdminEmail = "admin@ocean.demo",
            Status = PhLifecycleStatus.Active,
            OnboardingStep = 8,
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
                IsActive = true,
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
            AssemblyKind = "ORDINARY",
            Status = AssemblyStatus.Scheduled,
            ScheduledAtUtc = now.AddDays(1),
            EstimatedEndAtUtc = now.AddDays(1).AddHours(2),
            JoinWindowMinutesBefore = 30,
            ScheduleVersion = 1,
            RequiredQuorumPercent = 50.00m,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        foreach (var offset in new[] { 72, 24, 2 })
        {
            _db.ReminderRules.Add(new ReminderRule
            {
                Id = Guid.NewGuid(),
                TenantId = DemoSeedConstants.TenantOceanId,
                PropertyHorizontalId = DemoSeedConstants.PhOceanId,
                Name = $"T-{offset}h",
                OffsetHoursBeforeAssembly = offset,
                ChannelsJson = "[\"Portal\",\"Email\"]",
                IsEnabled = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        var agenda = new[]
        {
            (DemoSeedConstants.Agenda01Id, 1, "01", "VerificaciÃ³n de quÃ³rum e instalaciÃ³n"),
            (DemoSeedConstants.Agenda02Id, 2, "02", "Lectura y aprobaciÃ³n del orden del dÃ­a"),
            (DemoSeedConstants.Agenda03Id, 3, "03", "AprobaciÃ³n del presupuesto anual"),
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
            Body = "Se somete a consideraciÃ³n la aprobaciÃ³n del presupuesto anual de gastos comunes para la vigencia 2026.",
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
            TimeZoneId = "America/Panama",
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
            AssemblyKind = "ORDINARY",
            Status = AssemblyStatus.Scheduled,
            ScheduledAtUtc = now.AddDays(2),
            EstimatedEndAtUtc = now.AddDays(2).AddHours(2),
            JoinWindowMinutesBefore = 30,
            ScheduleVersion = 1,
            RequiredQuorumPercent = 50.00m,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        await _db.SaveChangesAsync(cancellationToken);
    }


    private async Task SeedUsersAsync(CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;

        // Operators have no ownership — units 107/108 owned by absentees + Approved powers to owners.
        var users = new (Guid UserId, string UserName, string Email, string DisplayName, string Role, Guid? UnitId, Guid? OwnerId)[]
        {
            (DemoSeedConstants.UserPresidentId, "president", "president@ocean.demo", "Presidente Asamblea", Roles.AssemblyPresident, null, DemoSeedConstants.OwnerPresidentId),
            (DemoSeedConstants.UserSecretaryId, "secretary", "secretary@ocean.demo", "Secretario Asamblea", Roles.AssemblySecretary, null, DemoSeedConstants.OwnerSecretaryId),
            (DemoSeedConstants.UserPhAdminId, "phadmin", "phadmin@ocean.demo", "Administrador PH", Roles.PHAdmin, null, null),
            (DemoSeedConstants.UserOwner101Id, "owner101", "owner101@ocean.demo", "Propietario 101", Roles.Owner, DemoSeedConstants.Unit101Id, DemoSeedConstants.Owner101Id),
            (DemoSeedConstants.UserOwner102Id, "owner102", "owner102@ocean.demo", "Propietario 102", Roles.Owner, DemoSeedConstants.Unit102Id, DemoSeedConstants.Owner102Id),
            (DemoSeedConstants.UserOwner103Id, "owner103", "owner103@ocean.demo", "Propietario 103", Roles.Owner, DemoSeedConstants.Unit103Id, DemoSeedConstants.Owner103Id),
            (DemoSeedConstants.UserOwner104Id, "owner104", "owner104@ocean.demo", "Propietario 104", Roles.Owner, DemoSeedConstants.Unit104Id, DemoSeedConstants.Owner104Id),
            (DemoSeedConstants.UserOwner105Id, "owner105", "owner105@ocean.demo", "Propietario 105", Roles.Owner, DemoSeedConstants.Unit105Id, DemoSeedConstants.Owner105Id),
            (DemoSeedConstants.UserOwner106Id, "owner106", "owner106@ocean.demo", "Propietario 106", Roles.Owner, DemoSeedConstants.Unit106Id, DemoSeedConstants.Owner106Id)
        };

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

            var password = DemoPasswordResolver.ResolveRequired(_configuration);
            var createResult = await _userManager.CreateAsync(user, password);
            if (!createResult.Succeeded)
            {
                throw new InvalidOperationException(
                    $"Failed to create user '{userName}': {string.Join(", ", createResult.Errors.Select(e => e.Description))}");
            }

            await _userManager.AddToRoleAsync(user, role);

            // Permissions come from RolePermissionMap at principal creation — do not persist them on users.
            await _userManager.AddClaimAsync(
                user,
                new System.Security.Claims.Claim("property_horizontal_id", DemoSeedConstants.PhOceanId.ToString("D")));

            _db.UserPropertyMemberships.Add(new UserPropertyMembership
            {
                Id = Guid.NewGuid(),
                TenantId = DemoSeedConstants.TenantOceanId,
                UserId = userId,
                PropertyHorizontalId = DemoSeedConstants.PhOceanId,
                RoleHint = role,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });

            if (ownerId is Guid oid)
            {
                _db.Owners.Add(new Owner
                {
                    Id = oid,
                    TenantId = DemoSeedConstants.TenantOceanId,
                    DisplayName = displayName,
                    Email = email,
                    UserId = userId,
                    Status = OwnerLifecycleStatus.Active,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }

            if (unitId is Guid uid && ownerId is Guid ownershipOwnerId)
            {
                _db.Ownerships.Add(new Ownership
                {
                    Id = Guid.NewGuid(),
                    TenantId = DemoSeedConstants.TenantOceanId,
                    UnitId = uid,
                    OwnerId = ownershipOwnerId,
                    SharePercent = 100.00m,
                    EffectiveFromUtc = now,
                    IsActive = true,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now
                });
            }

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

        if (!await _db.Owners.IgnoreQueryFilters().AnyAsync(o => o.Id == DemoSeedConstants.OwnerAbsentee107Id, cancellationToken))
        {
            _db.Owners.Add(new Owner
            {
                Id = DemoSeedConstants.OwnerAbsentee107Id,
                TenantId = DemoSeedConstants.TenantOceanId,
                DisplayName = "Propietario Ausente 107",
                Email = "absentee107@ocean.demo",
                UserId = null,
                Status = OwnerLifecycleStatus.Active,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        if (!await _db.Owners.IgnoreQueryFilters().AnyAsync(o => o.Id == DemoSeedConstants.OwnerAbsentee108Id, cancellationToken))
        {
            _db.Owners.Add(new Owner
            {
                Id = DemoSeedConstants.OwnerAbsentee108Id,
                TenantId = DemoSeedConstants.TenantOceanId,
                DisplayName = "Propietario Ausente 108",
                Email = "absentee108@ocean.demo",
                UserId = null,
                Status = OwnerLifecycleStatus.Active,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        if (!await _db.Ownerships.IgnoreQueryFilters().AnyAsync(
                o => o.UnitId == DemoSeedConstants.Unit107Id && o.OwnerId == DemoSeedConstants.OwnerAbsentee107Id,
                cancellationToken))
        {
            _db.Ownerships.Add(new Ownership
            {
                Id = Guid.NewGuid(),
                TenantId = DemoSeedConstants.TenantOceanId,
                UnitId = DemoSeedConstants.Unit107Id,
                OwnerId = DemoSeedConstants.OwnerAbsentee107Id,
                SharePercent = 100.00m,
                EffectiveFromUtc = now,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        if (!await _db.Ownerships.IgnoreQueryFilters().AnyAsync(
                o => o.UnitId == DemoSeedConstants.Unit108Id && o.OwnerId == DemoSeedConstants.OwnerAbsentee108Id,
                cancellationToken))
        {
            _db.Ownerships.Add(new Ownership
            {
                Id = Guid.NewGuid(),
                TenantId = DemoSeedConstants.TenantOceanId,
                UnitId = DemoSeedConstants.Unit108Id,
                OwnerId = DemoSeedConstants.OwnerAbsentee108Id,
                SharePercent = 100.00m,
                EffectiveFromUtc = now,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        if (!await _db.Powers.IgnoreQueryFilters().AnyAsync(p => p.Id == DemoSeedConstants.Power107To102Id, cancellationToken))
        {
            _db.Powers.Add(new Power
            {
                Id = DemoSeedConstants.Power107To102Id,
                TenantId = DemoSeedConstants.TenantOceanId,
                PropertyHorizontalId = DemoSeedConstants.PhOceanId,
                AssemblyId = DemoSeedConstants.AssemblyOceanId,
                PrincipalOwnerId = DemoSeedConstants.OwnerAbsentee107Id,
                RepresentativeUserId = DemoSeedConstants.UserOwner102Id,
                UnitId = DemoSeedConstants.Unit107Id,
                Status = PowerStatus.Approved,
                EvidenceReference = "EO-006 demo power 107→102",
                ValidatedAtUtc = now,
                ValidatedByUserId = DemoSeedConstants.UserPresidentId,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        if (!await _db.Powers.IgnoreQueryFilters().AnyAsync(p => p.Id == DemoSeedConstants.Power108To105Id, cancellationToken))
        {
            _db.Powers.Add(new Power
            {
                Id = DemoSeedConstants.Power108To105Id,
                TenantId = DemoSeedConstants.TenantOceanId,
                PropertyHorizontalId = DemoSeedConstants.PhOceanId,
                AssemblyId = DemoSeedConstants.AssemblyOceanId,
                PrincipalOwnerId = DemoSeedConstants.OwnerAbsentee108Id,
                RepresentativeUserId = DemoSeedConstants.UserOwner105Id,
                UnitId = DemoSeedConstants.Unit108Id,
                Status = PowerStatus.Approved,
                EvidenceReference = "EO-006 demo power 108→105",
                ValidatedAtUtc = now,
                ValidatedByUserId = DemoSeedConstants.UserPresidentId,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
    }

    /// <summary>
    /// Backfill active PH memberships for demo users (multi-PH switcher).
    /// </summary>
    private async Task EnsureUserPropertyMembershipsAsync(CancellationToken cancellationToken)
    {
        _currentTenant.TenantId = Guid.Empty;
        var now = DateTimeOffset.UtcNow;
        var users = await _userManager.Users.IgnoreQueryFilters()
            .Where(u => u.TenantId == DemoSeedConstants.TenantOceanId)
            .ToListAsync(cancellationToken);

        foreach (var user in users)
        {
            var exists = await _db.UserPropertyMemberships.IgnoreQueryFilters().AnyAsync(
                m => m.UserId == user.Id && m.PropertyHorizontalId == DemoSeedConstants.PhOceanId,
                cancellationToken);
            if (exists)
            {
                continue;
            }

            _db.UserPropertyMemberships.Add(new UserPropertyMembership
            {
                Id = Guid.NewGuid(),
                TenantId = DemoSeedConstants.TenantOceanId,
                UserId = user.Id,
                PropertyHorizontalId = DemoSeedConstants.PhOceanId,
                RoleHint = string.IsNullOrWhiteSpace(user.DemoRole) ? Roles.Owner : user.DemoRole,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        _currentTenant.TenantId = DemoSeedConstants.TenantOceanId;
    }

    /// <summary>
    /// Idempotent upgrade for existing Development databases created before EO-006.
    /// Moves units 107/108 to absentee owners and seeds Approved powers.
    /// </summary>
    private async Task EnsureEo006PowersAsync(CancellationToken cancellationToken)
    {
        if (await _db.Powers.IgnoreQueryFilters()
                .AnyAsync(p => p.Id == DemoSeedConstants.Power107To102Id, cancellationToken))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        _currentTenant.TenantId = Guid.Empty;

        var legacyOwnerships = await _db.Ownerships.IgnoreQueryFilters()
            .Where(o => o.UnitId == DemoSeedConstants.Unit107Id || o.UnitId == DemoSeedConstants.Unit108Id)
            .ToListAsync(cancellationToken);
        _db.Ownerships.RemoveRange(legacyOwnerships);

        if (!await _db.Owners.IgnoreQueryFilters().AnyAsync(o => o.Id == DemoSeedConstants.OwnerAbsentee107Id, cancellationToken))
        {
            _db.Owners.Add(new Owner
            {
                Id = DemoSeedConstants.OwnerAbsentee107Id,
                TenantId = DemoSeedConstants.TenantOceanId,
                DisplayName = "Propietario Ausente 107",
                Email = "absentee107@ocean.demo",
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
            _db.Owners.Add(new Owner
            {
                Id = DemoSeedConstants.OwnerAbsentee108Id,
                TenantId = DemoSeedConstants.TenantOceanId,
                DisplayName = "Propietario Ausente 108",
                Email = "absentee108@ocean.demo",
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        _db.Ownerships.Add(new Ownership
        {
            Id = Guid.NewGuid(),
            TenantId = DemoSeedConstants.TenantOceanId,
            UnitId = DemoSeedConstants.Unit107Id,
            OwnerId = DemoSeedConstants.OwnerAbsentee107Id,
            SharePercent = 100.00m,
            EffectiveFromUtc = now,
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });
        _db.Ownerships.Add(new Ownership
        {
            Id = Guid.NewGuid(),
            TenantId = DemoSeedConstants.TenantOceanId,
            UnitId = DemoSeedConstants.Unit108Id,
            OwnerId = DemoSeedConstants.OwnerAbsentee108Id,
            SharePercent = 100.00m,
            EffectiveFromUtc = now,
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        _db.Powers.Add(new Power
        {
            Id = DemoSeedConstants.Power107To102Id,
            TenantId = DemoSeedConstants.TenantOceanId,
            PropertyHorizontalId = DemoSeedConstants.PhOceanId,
            AssemblyId = DemoSeedConstants.AssemblyOceanId,
            PrincipalOwnerId = DemoSeedConstants.OwnerAbsentee107Id,
            RepresentativeUserId = DemoSeedConstants.UserOwner102Id,
            UnitId = DemoSeedConstants.Unit107Id,
            Status = PowerStatus.Approved,
            EvidenceReference = "EO-006 demo power 107→102",
            ValidatedAtUtc = now,
            ValidatedByUserId = DemoSeedConstants.UserPresidentId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });
        _db.Powers.Add(new Power
        {
            Id = DemoSeedConstants.Power108To105Id,
            TenantId = DemoSeedConstants.TenantOceanId,
            PropertyHorizontalId = DemoSeedConstants.PhOceanId,
            AssemblyId = DemoSeedConstants.AssemblyOceanId,
            PrincipalOwnerId = DemoSeedConstants.OwnerAbsentee108Id,
            RepresentativeUserId = DemoSeedConstants.UserOwner105Id,
            UnitId = DemoSeedConstants.Unit108Id,
            Status = PowerStatus.Approved,
            EvidenceReference = "EO-006 demo power 108→105",
            ValidatedAtUtc = now,
            ValidatedByUserId = DemoSeedConstants.UserPresidentId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        });

        var operatorParticipants = await _db.AssemblyParticipants.IgnoreQueryFilters()
            .Where(p => p.AssemblyId == DemoSeedConstants.AssemblyOceanId
                        && (p.UserId == DemoSeedConstants.UserPresidentId
                            || p.UserId == DemoSeedConstants.UserSecretaryId))
            .ToListAsync(cancellationToken);
        foreach (var p in operatorParticipants)
        {
            p.UnitId = null;
        }

        await _db.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("EO-006 demo powers ensured (107→102, 108→105).");
    }
}
