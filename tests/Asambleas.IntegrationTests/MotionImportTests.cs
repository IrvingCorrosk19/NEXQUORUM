using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Asambleas.Contracts.Motions;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class MotionImportTests
{
    private readonly AsambleasFixture _fixture;

    public MotionImportTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Template_analyze_commit_csv_creates_draft_motions_idempotent()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var assemblyId = DemoSeedConstants.AssemblyOceanId;

        var template = await president.GetAsync($"/api/assemblies/{assemblyId}/motions/import/template");
        template.StatusCode.Should().Be(HttpStatusCode.OK);
        template.Content.Headers.ContentType!.MediaType.Should().Contain("spreadsheetml");

        var catalogs = await president.GetAsync($"/api/assemblies/{assemblyId}/motions/import/catalogs");
        catalogs.StatusCode.Should().Be(HttpStatusCode.OK);
        var catalogBody = await catalogs.Content.ReadFromJsonAsync<MotionImportCatalogsDto>();
        catalogBody!.AgendaItems.Should().NotBeEmpty();
        var agendaCode = catalogBody.AgendaItems[0].Code;

        var csv = BuildCsv(agendaCode, rows: 3, badRow: true);
        var analyze = await PostCsvAsync(president, assemblyId, csv);
        analyze.StatusCode.Should().Be(HttpStatusCode.OK);
        var preview = await analyze.Content.ReadFromJsonAsync<MotionImportPreviewDto>();
        preview!.Total.Should().Be(4);
        preview.Errors.Should().BeGreaterThan(0);
        preview.CanCommit.Should().BeFalse();

        // Fix the bad row (row 5: empty title) via patch
        var bad = preview.Rows.First(r => r.Status == "Error");
        var patched = await president.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/motions/import/patch-row",
            new MotionImportRowPatchRequest(
                preview.SessionId,
                bad.RowNumber,
                TituloCorto: "Pregunta corregida",
                Pregunta: "Texto completo corregido?",
                PuntoAgenda: agendaCode,
                Orden: bad.Orden,
                Opcion1: "A favor",
                Opcion2: "En contra",
                Opcion3: "Abstencion",
                TipoRespuesta: "A favor / En contra / Abstencion",
                Metodo: "Por coeficiente",
                Mayoria: "Mayoria simple",
                VisibilidadResultado: "Oculto hasta cierre",
                VotoSecreto: "No",
                EstadoImportacion: "Borrador"));
        patched.StatusCode.Should().Be(HttpStatusCode.OK);
        preview = await patched.Content.ReadFromJsonAsync<MotionImportPreviewDto>();
        preview!.CanCommit.Should().BeTrue();
        preview.Errors.Should().Be(0);

        var clientRequestId = "import-idem-" + Guid.NewGuid().ToString("N");
        var commit1 = await president.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/motions/import/commit",
            new MotionImportCommitRequest(preview.SessionId, PublishReadyRows: false, ClientRequestId: clientRequestId));
        commit1.StatusCode.Should().Be(HttpStatusCode.OK);
        var result1 = await commit1.Content.ReadFromJsonAsync<MotionImportCommitResultDto>();
        result1!.Imported.Should().Be(4);
        result1.Published.Should().Be(0);
        result1.MotionIds.Should().HaveCount(4);

        var commitReplay = await president.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/motions/import/commit",
            new MotionImportCommitRequest(Guid.NewGuid(), false, clientRequestId));
        commitReplay.StatusCode.Should().Be(HttpStatusCode.OK);
        var result2 = await commitReplay.Content.ReadFromJsonAsync<MotionImportCommitResultDto>();
        result2!.IdempotentReplay.Should().BeTrue();
        result2.Imported.Should().Be(result1.Imported);

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var created = await db.Motions.IgnoreQueryFilters()
            .CountAsync(m => m.AssemblyId == assemblyId && result1.MotionIds.Contains(m.Id));
        created.Should().Be(4);
        var drafts = await db.Motions.IgnoreQueryFilters()
            .CountAsync(m => result1.MotionIds.Contains(m.Id) && m.DesignStatus == "Draft");
        drafts.Should().Be(4);
    }

    [Fact]
    public async Task Cross_tenant_cannot_import_into_foreign_assembly()
    {
        await _fixture.ResetDatabaseAsync();
        // Owner without motion:create should be forbidden
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var csv = "Orden,PuntoAgenda,TituloCorto,Pregunta,TipoRespuesta,Opcion1,Opcion2,Metodo,Mayoria,VisibilidadResultado,VotoSecreto\n";
        var res = await PostCsvAsync(owner, DemoSeedConstants.AssemblyOceanId, csv + "1,01,T,Q?,FavorAgainstAbstain,A,B,Coefficient,SimpleMajority,HiddenUntilClose,No\n");
        res.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.Unauthorized);
    }

    private static string BuildCsv(string agendaCode, int rows, bool badRow, string codePrefix = "IMP")
    {
        var sb = new StringBuilder();
        sb.AppendLine("Orden,PuntoAgenda,Codigo,TituloCorto,Pregunta,Instrucciones,TipoRespuesta,Opcion1,Opcion2,Opcion3,Opcion4,Opcion5,Metodo,Mayoria,UmbralPorcentaje,VisibilidadResultado,VotoSecreto,EstadoImportacion");
        for (var i = 1; i <= rows; i++)
        {
            sb.AppendLine($"{i},{agendaCode},{codePrefix}-{i},Titulo {i},Pregunta completa {i}?,Instruccion,A favor / En contra / Abstencion,A favor,En contra,Abstencion,,,Por coeficiente,Mayoria simple,,Oculto hasta cierre,No,Borrador");
        }
        if (badRow)
        {
            sb.AppendLine($"{rows + 1},{agendaCode},{codePrefix}-BAD,,, ,A favor / En contra / Abstencion,A favor,En contra,Abstencion,,,Por coeficiente,Mayoria simple,,Oculto hasta cierre,No,Borrador");
        }
        return sb.ToString();
    }

    private static async Task<HttpResponseMessage> PostCsvAsync(AuthenticatedClient client, Guid assemblyId, string csv)
    {
        using var content = new MultipartFormDataContent();
        var bytes = Encoding.UTF8.GetBytes(csv);
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("text/csv");
        content.Add(file, "file", "preguntas.csv");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/assemblies/{assemblyId}/motions/import/analyze")
        {
            Content = content
        };
        request.Headers.TryAddWithoutValidation("RequestVerificationToken", client.AntiforgeryToken);
        return await client.Client.SendAsync(request);
    }
}