using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Representation;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class BulkAccreditationTests
{
    private readonly AsambleasFixture _fixture;
    public BulkAccreditationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Selected_verified_bulk_accredits_without_force_absent_permission()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var preview = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk/preview",
            new BulkAccreditRequest(UserIds: [DemoSeedConstants.UserOwner101Id]));
        preview.EnsureSuccessStatusCode();

        var ok = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk",
            new BulkAccreditRequest(UserIds: [DemoSeedConstants.UserOwner101Id], Method: "OperatorBulkSelected"));
        ok.EnsureSuccessStatusCode();
        var bulk = await ok.Content.ReadFromJsonAsync<BulkAccreditResponse>();
        bulk!.Succeeded.Should().Be(1);
        bulk.BatchId.Should().NotBeEmpty();

        var again = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk",
            new BulkAccreditRequest(UserIds: [DemoSeedConstants.UserOwner101Id], ClientBatchId: bulk.BatchId));
        again.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task AllEligible_without_include_absent_does_not_target_registered_invitees()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var previewRes = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk/preview",
            new BulkAccreditRequest(AllEligible: true));
        previewRes.EnsureSuccessStatusCode();
        var preview = await previewRes.Content.ReadFromJsonAsync<BulkAccreditPreviewDto>();
        preview!.AbsentInvitees.Should().Be(0);
        preview.NewToAccredit.Should().Be(0);
    }

    [Fact]
    public async Task Force_absent_without_permission_is_forbidden()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var blocked = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk",
            new BulkAccreditRequest(
                AllEligible: true,
                IncludeAbsentInvitees: true,
                ConfirmAccreditAbsentInvitees: true,
                AbsentConfirmationPhrase: "ACREDITAR AUSENTES",
                AbsentAccreditationReason: "Motivo de prueba suficientemente largo"));
        blocked.StatusCode.Should().BeOneOf(HttpStatusCode.BadRequest, HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Close_checkin_desk_returns_to_scheduled()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();
        var close = await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/close-checkin");
        close.EnsureSuccessStatusCode();
        var summary = await close.Content.ReadFromJsonAsync<AssemblySummaryDto>();
        summary!.Status.Should().Be(nameof(AssemblyStatus.Scheduled));
    }

    [Fact]
    public async Task Deaccredit_bulk_and_reaccredit_preserves_power_eligibility()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner102 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner102@ocean.demo");
        (await owner102.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                new CheckInRequest(null, "Virtual", "SelfCheckIn")))
            .EnsureSuccessStatusCode();

        var de = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/deaccredit-bulk",
            new BulkDeaccreditRequest([DemoSeedConstants.UserOwner102Id], "Correccion de mesa batch"));
        de.EnsureSuccessStatusCode();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            (await db.Powers.IgnoreQueryFilters().CountAsync(p =>
                p.AssemblyId == DemoSeedConstants.AssemblyOceanId
                && p.RepresentativeUserId == DemoSeedConstants.UserOwner102Id
                && p.Status == PowerStatus.Approved)).Should().BeGreaterThan(0);
            (await db.Ownerships.IgnoreQueryFilters().CountAsync(o => o.IsActive)).Should().BeGreaterThan(0);
            (await db.AssemblyRepresentations.IgnoreQueryFilters().CountAsync(r =>
                r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                && r.RepresentativeUserId == DemoSeedConstants.UserOwner102Id
                && r.IsActive)).Should().Be(0);
            (await db.AssemblyRepresentations.IgnoreQueryFilters().CountAsync(r =>
                r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                && r.RepresentativeUserId == DemoSeedConstants.UserOwner102Id
                && !r.IsActive)).Should().BeGreaterThan(0);
        }

        (await owner102.PostJsonAsync(
                $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
                new CheckInRequest(null, "Virtual", "SelfCheckIn")))
            .EnsureSuccessStatusCode();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var active = await db.AssemblyRepresentations.IgnoreQueryFilters()
                .Where(r => r.AssemblyId == DemoSeedConstants.AssemblyOceanId
                            && r.RepresentativeUserId == DemoSeedConstants.UserOwner102Id
                            && r.IsActive)
                .ToListAsync();
            active.Should().HaveCount(2);
            active.Sum(r => r.CoefficientSnapshot).Should().Be(22m);
        }
    }

    [Fact]
    public async Task Scale_300_selected_bulk_under_5_seconds()
    {
        await _fixture.ResetDatabaseAsync();
        const int n = 300;
        var sw = Stopwatch.StartNew();
        List<Guid> scaleUserIds;

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var assembly = await db.Assemblies.IgnoreQueryFilters()
                .FirstAsync(a => a.Id == DemoSeedConstants.AssemblyOceanId);
            var tenantId = assembly.TenantId;
            var phId = assembly.PropertyHorizontalId;
            var now = DateTimeOffset.UtcNow;
            var coeff = Math.Round(100m / n, 4, MidpointRounding.AwayFromZero);

            foreach (var u in await db.Units.IgnoreQueryFilters().Where(u => u.PropertyHorizontalId == phId).ToListAsync())
                u.IsActive = false;

            var units = new List<Unit>(n);
            var owners = new List<Owner>(n);
            var ownerships = new List<Ownership>(n);
            var users = new List<Guid>(n);
            for (var i = 0; i < n; i++)
            {
                var unitId = Guid.NewGuid();
                var ownerId = Guid.NewGuid();
                var userId = Guid.NewGuid();
                users.Add(userId);
                units.Add(new Unit
                {
                    Id = unitId, TenantId = tenantId, PropertyHorizontalId = phId,
                    Code = $"S{i:D3}",
                    CoefficientPercent = i == n - 1 ? 100m - coeff * (n - 1) : coeff,
                    IsActive = true, CreatedAtUtc = now, UpdatedAtUtc = now
                });
                owners.Add(new Owner
                {
                    Id = ownerId, TenantId = tenantId, DisplayName = $"Scale Owner {i:D3}",
                    Email = $"scale{i:D3}@ocean.demo", UserId = userId,
                    Status = OwnerLifecycleStatus.Active, RegisteredPropertyHorizontalId = phId,
                    CreatedAtUtc = now, UpdatedAtUtc = now
                });
                ownerships.Add(new Ownership
                {
                    Id = Guid.NewGuid(), TenantId = tenantId, OwnerId = ownerId, UnitId = unitId,
                    SharePercent = 100m, IsActive = true, CreatedAtUtc = now, UpdatedAtUtc = now
                });
            }

            db.Units.AddRange(units);
            db.Owners.AddRange(owners);
            db.Ownerships.AddRange(ownerships);
            db.AssemblyParticipants.AddRange(users.Select((userId, i) => new AssemblyParticipant
            {
                Id = Guid.NewGuid(), TenantId = tenantId, AssemblyId = DemoSeedConstants.AssemblyOceanId,
                UserId = userId, UnitId = units[i].Id, DisplayName = owners[i].DisplayName,
                RoleCode = "Owner", AttendanceStatus = AttendanceStatus.Registered,
                CreatedAtUtc = now, UpdatedAtUtc = now
            }));
            await db.SaveChangesAsync();
            scaleUserIds = users;
        }

        var seedMs = sw.ElapsedMilliseconds;
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        sw.Restart();
        var preview = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk/preview",
            new BulkAccreditRequest(UserIds: scaleUserIds));
        var previewMs = sw.ElapsedMilliseconds;
        preview.EnsureSuccessStatusCode();

        sw.Restart();
        var bulk = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/accredit-bulk",
            new BulkAccreditRequest(UserIds: scaleUserIds, Method: "OperatorBulkSelected"));
        var httpMs = sw.ElapsedMilliseconds;
        bulk.EnsureSuccessStatusCode();
        var result = await bulk.Content.ReadFromJsonAsync<BulkAccreditResponse>();
        result!.Requested.Should().Be(n);
        result.Succeeded.Should().Be(n);
        result.CoefficientAfter.Should().BeApproximately(100m, 0.05m);

        previewMs.Should().BeLessThan(2000, "preview 300 target <2s");
        httpMs.Should().BeLessThan(5000, $"accredit 300 target <5s (was {httpMs}ms)");
        seedMs.Should().BeLessThan(60_000);

        var metricsPath = Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
            "docs", "AUDIT", "acreditacion-bench-300.json");
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(metricsPath)!);
            await File.WriteAllTextAsync(metricsPath,
                System.Text.Json.JsonSerializer.Serialize(new
                {
                    operation = "accredit-bulk",
                    records = n,
                    previewMs,
                    accreditMs = httpMs,
                    seedMs,
                    saveChanges = 1,
                    provider = "PostgreSQL",
                    atUtc = DateTimeOffset.UtcNow
                }, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
        }
        catch
        {
            // best-effort metrics artifact
        }
    }
}