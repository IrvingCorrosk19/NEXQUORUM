using System.Net;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class MotionStudioIsolationTests
{
    private readonly AsambleasFixture _fixture;

    public MotionStudioIsolationTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Owner_cannot_create_motion_or_download_import_template()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var assemblyId = DemoSeedConstants.AssemblyOceanId;

        var create = await owner.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/motions",
            new
            {
                agendaItemId = DemoSeedConstants.Agenda03Id,
                code = "ISO-OWN",
                title = "Should fail",
                body = "x",
                questionText = "x?",
                ballotKind = "FavorAgainstAbstain",
                calculationMethod = "Coefficient",
                decisionRuleCode = "SimpleMajority",
                optionsJson = "[\"A favor\",\"En contra\",\"Abstencion\"]"
            });
        create.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.Unauthorized);

        var template = await owner.Client.GetAsync($"/api/assemblies/{assemblyId}/motions/import/template");
        template.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.Unauthorized, HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Ocean_user_cannot_list_or_mutate_other_tenant_motions()
    {
        await _fixture.ResetDatabaseAsync();
        var attacker = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var foreign = DemoSeedConstants.AssemblyOtherId;

        var list = await attacker.Client.GetAsync($"/api/assemblies/{foreign}/motions");
        AssertDenied(list, await list.Content.ReadAsStringAsync());

        var create = await attacker.PostJsonAsync(
            $"/api/assemblies/{foreign}/motions",
            new
            {
                agendaItemId = Guid.NewGuid(),
                code = "X-TEN",
                title = "leak",
                body = "leak",
                questionText = "leak?",
                ballotKind = "FavorAgainstAbstain",
                calculationMethod = "Coefficient",
                decisionRuleCode = "SimpleMajority",
                optionsJson = "[\"A favor\",\"En contra\",\"Abstencion\"]"
            });
        AssertDenied(create, await create.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Spoofed_foreign_assembly_cannot_edit_ocean_motion()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        var put = await president.PutJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}/motions/{DemoSeedConstants.Motion001Id}",
            new
            {
                agendaItemId = DemoSeedConstants.Agenda03Id,
                code = "HACK",
                title = "hack",
                body = "hack",
                questionText = "hack?",
                ballotKind = "FavorAgainstAbstain",
                calculationMethod = "Coefficient",
                decisionRuleCode = "SimpleMajority",
                optionsJson = "[\"A favor\",\"En contra\",\"Abstencion\"]"
            });
        AssertDenied(put, await put.Content.ReadAsStringAsync());
    }

    private static void AssertDenied(HttpResponseMessage response, string body)
    {
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound,
            HttpStatusCode.BadRequest,
            HttpStatusCode.Unauthorized);
        body.Should().NotContain("PH OTHER");
        body.Should().NotContain(DemoSeedConstants.TenantOtherId.ToString("D"));
        ((int)response.StatusCode).Should().NotBe(200);
    }
}