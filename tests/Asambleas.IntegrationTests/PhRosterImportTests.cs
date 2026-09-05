using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Asambleas.Contracts.PhOnboarding;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class PhRosterImportTests
{
    private readonly AsambleasFixture _fixture;

    public PhRosterImportTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Template_legacy_csv_commit_idempotent_and_owner_forbidden()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        var phRes = await president.PostJsonAsync("/api/ph", new
        {
            name = "PH Roster Import Cert",
            code = "PHROST" + DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            timeZoneId = "America/Panama",
            country = "PA",
            adminEmail = "president@ocean.demo"
        });
        phRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var ph = await phRes.Content.ReadFromJsonAsync<PhDetailDto>();
        ph.Should().NotBeNull();
        var phId = ph!.Id;

        var switchRes = await president.PostJsonAsync("/api/ph/switch", new { propertyHorizontalId = phId });
        switchRes.StatusCode.Should().Be(HttpStatusCode.OK);

        var template = await president.Client.GetAsync($"/api/ph/{phId}/import/template");
        template.StatusCode.Should().Be(HttpStatusCode.OK);
        template.Content.Headers.ContentType!.MediaType.Should().Contain("spreadsheetml");
        var templateBytes = await template.Content.ReadAsByteArrayAsync();
        templateBytes.Length.Should().BeGreaterThan(1000);

        var csv = BuildLegacyCsv(units: 5, badEmailRow: true);
        var analyze = await PostCsvAsync(president, phId, csv);
        analyze.StatusCode.Should().Be(HttpStatusCode.OK);
        var preview = await analyze.Content.ReadFromJsonAsync<PhRosterImportPreviewDto>();
        preview.Should().NotBeNull();
        preview!.Owners.Should().HaveCount(6);
        preview.Summary.OwnersErrors.Should().BeGreaterThan(0);
        preview.Summary.CanCommit.Should().BeFalse();

        var bad = preview.Owners.First(o => o.Status == "Error");
        var patched = await president.PostJsonAsync(
            $"/api/ph/{phId}/import/patch-row",
            new PhRosterImportPatchRequest(
                preview.SessionId,
                PhRosterImportSheets.Owners,
                bad.RowNumber,
                Email: "fixed.owner@roster.test"));
        patched.StatusCode.Should().Be(HttpStatusCode.OK);
        preview = await patched.Content.ReadFromJsonAsync<PhRosterImportPreviewDto>();
        var errDetail = string.Join(" | ",
            preview!.Units.Where(r => r.Status == "Error").Select(r => $"U{r.RowNumber}:{string.Join(',', r.Issues)}")
            .Concat(preview.Owners.Where(r => r.Status == "Error").Select(r => $"O{r.RowNumber}:{string.Join(',', r.Issues)}"))
            .Concat(preview.Relations.Where(r => r.Status == "Error").Select(r => $"R{r.RowNumber}:{string.Join(',', r.Issues)}")));
        preview.Summary.CanCommit.Should().BeTrue(
            $"blocked={preview.Summary.ActiveAssemblyBlocked} Uerr={preview.Summary.UnitsErrors} Oerr={preview.Summary.OwnersErrors} Rerr={preview.Summary.RelationsErrors} Unew={preview.Summary.UnitsNew} detail={errDetail}");
        preview.Summary.OwnersErrors.Should().Be(0);

        var clientRequestId = "roster-idem-" + Guid.NewGuid().ToString("N");
        var commit1 = await president.PostJsonAsync(
            $"/api/ph/{phId}/import/commit",
            new PhRosterImportCommitRequest(
                preview.SessionId,
                PhRosterImportModes.CreateOnly,
                ConfirmUpdate: false,
                ClientRequestId: clientRequestId,
                ConfirmPhName: ph.Name));
        commit1.StatusCode.Should().Be(HttpStatusCode.OK);
        var result1 = await commit1.Content.ReadFromJsonAsync<PhRosterImportCommitResultDto>();
        result1!.UnitsCreated.Should().Be(6);
        result1.OwnersCreated.Should().Be(6);
        result1.OwnershipsCreated.Should().Be(6);
        result1.IdempotentReplay.Should().BeFalse();

        var commit2 = await president.PostJsonAsync(
            $"/api/ph/{phId}/import/commit",
            new PhRosterImportCommitRequest(
                preview.SessionId,
                PhRosterImportModes.CreateOnly,
                ClientRequestId: clientRequestId));
        commit2.StatusCode.Should().Be(HttpStatusCode.OK);
        var result2 = await commit2.Content.ReadFromJsonAsync<PhRosterImportCommitResultDto>();
        result2!.IdempotentReplay.Should().BeTrue();
        result2.UnitsCreated.Should().Be(result1.UnitsCreated);

        using (var scope = _fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var units = await db.Units.IgnoreQueryFilters()
                .CountAsync(u => u.PropertyHorizontalId == phId && u.Code.StartsWith("RI-"));
            units.Should().Be(6);
            var ownerships = await db.Ownerships.IgnoreQueryFilters().CountAsync(o =>
                db.Units.IgnoreQueryFilters().Any(u => u.Id == o.UnitId && u.PropertyHorizontalId == phId));
            ownerships.Should().Be(6);
        }

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var forbidden = await owner.Client.GetAsync($"/api/ph/{phId}/import/template");
        forbidden.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.Unauthorized, HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Active_assembly_blocks_commit()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var phId = DemoSeedConstants.PhOceanId;

        using (var scope = _fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var asm = await db.Assemblies.IgnoreQueryFilters()
                .FirstAsync(a => a.Id == DemoSeedConstants.AssemblyOceanId);
            asm.Status = Domain.Enums.AssemblyStatus.InProgress;
            await db.SaveChangesAsync();
        }

        var csv = "Unidad,Torre,Piso,Coeficiente,Nombre,Apellido,Identificacion,Email,Telefono\n" +
                  "BLK-01,T1,1,0.5,Bloqueo,Test,9-999-001,block.import@roster.test,+50760009999\n";
        var analyze = await PostCsvAsync(president, phId, csv);
        analyze.StatusCode.Should().Be(HttpStatusCode.OK);
        var preview = await analyze.Content.ReadFromJsonAsync<PhRosterImportPreviewDto>();
        preview!.Summary.ActiveAssemblyBlocked.Should().BeTrue();
        preview.Summary.CanCommit.Should().BeFalse();

        var commit = await president.PostJsonAsync(
            $"/api/ph/{phId}/import/commit",
            new PhRosterImportCommitRequest(preview.SessionId, PhRosterImportModes.CreateOnly));
        commit.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    private static string BuildLegacyCsv(int units, bool badEmailRow)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Unidad,Torre,Piso,Coeficiente,Nombre,Apellido,Identificacion,Email,Telefono");
        for (var i = 1; i <= units; i++)
        {
            sb.AppendLine($"RI-{i:D3},T1,{i},{1.0m:0.####},Nombre{i},Apellido{i},8-100-{i:D3},owner{i}@roster.test,+5076000{i:D4}");
        }

        if (badEmailRow)
        {
            sb.AppendLine("RI-BAD,T1,9,0.1,Bad,Row,8-100-999,not-an-email,+50760009998");
        }

        return sb.ToString();
    }

    private static async Task<HttpResponseMessage> PostCsvAsync(AuthenticatedClient client, Guid phId, string csv)
    {
        await client.RefreshAntiforgeryAsync();
        using var content = new MultipartFormDataContent();
        var bytes = Encoding.UTF8.GetBytes(csv);
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        content.Add(file, "file", "roster.csv");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/ph/{phId}/import/analyze")
        {
            Content = content
        };
        request.Headers.TryAddWithoutValidation("RequestVerificationToken", client.AntiforgeryToken);
        return await client.Client.SendAsync(request);
    }
}