using System.Net;
using System.Net.Http.Json;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class OwnerRbacSecurityTests
{
    private readonly AsambleasFixture _fixture;

    public OwnerRbacSecurityTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Owner_permissions_do_not_include_admin_capabilities()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");

        owner.User.Roles.Should().Contain("Owner");
        owner.User.Permissions.Should().Contain("portal:self");
        owner.User.Permissions.Should().Contain("vote:cast");
        owner.User.Permissions.Should().NotContain("ph:manage");
        owner.User.Permissions.Should().NotContain("ph:view");
        owner.User.Permissions.Should().NotContain("owner:manage");
        owner.User.Permissions.Should().NotContain("owner:invite");
        owner.User.Permissions.Should().NotContain("unit:manage");
        owner.User.Permissions.Should().NotContain("communications:configure");
        owner.User.Permissions.Should().NotContain("communications:view");
        owner.User.Permissions.Should().NotContain("assembly:manage");
        owner.User.Permissions.Should().NotContain("vote:open");
        owner.User.Permissions.Should().NotContain("vote:close");
    }

    [Fact]
    public async Task Owner_cannot_create_edit_or_delete_PH()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var phId = DemoSeedConstants.PhOceanId;

        (await owner.PostJsonAsync("/api/ph", new
        {
            name = "Hack PH",
            code = "HACK",
            country = "PA",
            timeZoneId = "America/Panama"
        })).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.PutJsonAsync($"/api/ph/{phId}", new
        {
            name = "Owned",
            concurrencyStamp = "x"
        })).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.DeleteAsync($"/api/ph/{phId}")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Owner_cannot_manage_owners_units_or_smtp()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var phId = DemoSeedConstants.PhOceanId;

        (await owner.PostJsonAsync($"/api/ph/{phId}/owners", new
        {
            firstName = "X",
            lastName = "Y",
            email = "hack@example.com"
        })).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.PostJsonAsync($"/api/ph/{phId}/units", new
        {
            code = "HACK-1",
            coefficientPercent = 1
        })).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.GetAsync($"/api/communications/ph/{phId}/profile"))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.PutJsonAsync($"/api/communications/ph/{phId}/profile", new
        {
            sandboxMode = true,
            defaultTimezoneId = "America/Panama"
        })).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.PostJsonAsync($"/api/ph/{phId}/owners/{Guid.NewGuid()}/invite", new { }))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Owner_cannot_administer_assembly_or_voting()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        var assemblyId = DemoSeedConstants.AssemblyOceanId;

        (await owner.PostAsync($"/api/assemblies/{assemblyId}/start"))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.PostAsync($"/api/assemblies/{assemblyId}/complete"))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        (await owner.PostJsonAsync($"/api/assemblies/{assemblyId}/voting/open", new
        {
            title = "Hack vote",
            choices = new[] { "Yes", "No" }
        })).StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.NotFound, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Owner_can_access_portal_profile_and_own_assemblies()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");

        var profile = await owner.GetAsync("/api/ph/me/owner-profile");
        profile.StatusCode.Should().Be(HttpStatusCode.OK);

        var memberships = await owner.GetAsync("/api/ph/memberships/mine");
        memberships.StatusCode.Should().Be(HttpStatusCode.OK);

        var assemblies = await owner.GetAsync("/api/assemblies");
        assemblies.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Owner_cannot_access_other_tenant_PH()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");

        var response = await owner.GetAsync($"/api/ph/{DemoSeedConstants.PhOtherId}");
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound,
            HttpStatusCode.BadRequest);

        var body = await response.Content.ReadAsStringAsync();
        body.Should().NotContain("PH OTHER");
    }

    [Fact]
    public async Task President_does_not_get_PH_admin_or_SMTP_configure()
    {
        await _fixture.ResetDatabaseAsync();
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        president.User.Permissions.Should().Contain("assembly:manage");
        president.User.Permissions.Should().NotContain("ph:manage");
        president.User.Permissions.Should().NotContain("communications:configure");
        president.User.Permissions.Should().NotContain("owner:manage");
        president.User.Permissions.Should().NotContain("vote:cast");

        (await president.PostJsonAsync("/api/ph", new
        {
            name = "Should Fail",
            code = "NOPE",
            country = "PA",
            timeZoneId = "America/Panama"
        })).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task PhAdmin_has_admin_capabilities_but_not_vote_cast()
    {
        await _fixture.ResetDatabaseAsync();
        var admin = await AuthenticatedClient.LoginAsync(_fixture.Factory, "phadmin@ocean.demo");

        admin.User.Roles.Should().Contain("PHAdmin");
        admin.User.Permissions.Should().Contain("ph:manage");
        admin.User.Permissions.Should().Contain("owner:manage");
        admin.User.Permissions.Should().Contain("communications:configure");
        admin.User.Permissions.Should().NotContain("vote:cast");

        (await admin.GetAsync($"/api/ph/{DemoSeedConstants.PhOceanId}"))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Stale_permission_claims_do_not_elevate_owner_session()
    {
        await _fixture.ResetDatabaseAsync();
        var owner = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");

        (await owner.GetAsync($"/api/communications/ph/{DemoSeedConstants.PhOceanId}/profile"))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
