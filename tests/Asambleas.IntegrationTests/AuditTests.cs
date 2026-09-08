using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Audit;
using Asambleas.Contracts.Representation;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class AuditTests
{
    private readonly AsambleasFixture _fixture;

    public AuditTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Admin_accredit_creates_audit_event()
    {
        await _fixture.ResetDatabaseAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var accredit = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/participants/{DemoSeedConstants.UserOwner102Id}/accredit",
            new AccreditRequest(PresenceType.Virtual.ToString(), "OperatorCheckIn"));
        accredit.StatusCode.Should().Be(HttpStatusCode.OK);

        var auditor = await AuthenticatedClient.LoginAsync(_fixture.Factory, "secretary@ocean.demo");
        var auditResponse = await auditor.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/audit?eventType={AuditEventType.ParticipantAccredited}");
        auditResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var page = await auditResponse.Content.ReadFromJsonAsync<AuditEventPageDto>();
        page.Should().NotBeNull();
        page!.Items.Should().Contain(e => e.EventType == AuditEventType.ParticipantAccredited);
    }
}
