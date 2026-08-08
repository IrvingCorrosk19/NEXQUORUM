using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Assemblies;
using Asambleas.Contracts.Audit;
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
    public async Task Check_in_creates_audit_event()
    {
        await _fixture.ResetDatabaseAsync();

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        (await president.PostAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/start-checkin"))
            .EnsureSuccessStatusCode();

        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner102@ocean.demo");
        var checkIn = await owner.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/attendance/check-in",
            new CheckInRequest(DemoSeedConstants.Unit102Id, PresenceType.Virtual.ToString()));
        checkIn.StatusCode.Should().Be(HttpStatusCode.OK);

        var auditor = await AuthenticatedClient.LoginAsync(_fixture.Factory, "secretary@ocean.demo");
        var auditResponse = await auditor.GetAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/audit?eventType={AuditEventType.CheckIn}");
        auditResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var page = await auditResponse.Content.ReadFromJsonAsync<AuditEventPageDto>();
        page.Should().NotBeNull();
        page!.Items.Should().Contain(e => e.EventType == AuditEventType.CheckIn);
        page.Items.Should().Contain(e =>
            e.EventType == AuditEventType.CheckIn
            && e.UserId == DemoSeedConstants.UserOwner102Id);
    }
}
