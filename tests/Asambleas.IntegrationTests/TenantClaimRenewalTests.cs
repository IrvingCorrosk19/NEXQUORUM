using System.Net;
using System.Security.Claims;
using Asambleas.Infrastructure.Identity;
using Asambleas.IntegrationTests.Infrastructure;
using Asambleas.Web.Security;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class TenantClaimRenewalTests
{
    private readonly AsambleasFixture _fixture;

    public TenantClaimRenewalTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Login_and_ph_reads_keep_a_single_tenant_claim_after_principal_renewal()
    {
        await _fixture.ResetDatabaseAsync();

        await using var factory = new AsambleasWebApplicationFactory(
            _fixture.Factory.ConnectionString,
            services => services.PostConfigure<SecurityStampValidatorOptions>(options =>
            {
                options.ValidationInterval = TimeSpan.Zero;
            }));
        _ = factory.Services;

        await using var scope = factory.Services.CreateAsyncScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var signInManager = scope.ServiceProvider.GetRequiredService<SignInManager<ApplicationUser>>();
        var user = await userManager.FindByEmailAsync("president@ocean.demo");
        user.Should().NotBeNull();
        user!.TenantId.Should().NotBe(Guid.Empty);

        await userManager.AddClaimAsync(user, new Claim(AsambleasClaimTypes.TenantId, Guid.Empty.ToString("D")));
        await userManager.AddClaimAsync(user, new Claim(AsambleasClaimTypes.TenantId, user.TenantId.ToString("D")));

        var renewed = await signInManager.CreateUserPrincipalAsync(user);
        renewed.FindAll(AsambleasClaimTypes.TenantId).Should().ContainSingle()
            .Which.Value.Should().Be(user.TenantId.ToString("D"));
        renewed.FindAll(AsambleasClaimTypes.OrganizationId).Should().ContainSingle()
            .Which.Value.Should().Be(user.OrganizationId!.Value.ToString("D"));
        renewed.FindAll(AsambleasClaimTypes.DisplayName).Should().ContainSingle()
            .Which.Value.Should().Be(user.DisplayName);

        var client = await AuthenticatedClient.LoginAsync(factory, "president@ocean.demo");
        client.User.TenantId.Should().Be(user.TenantId);

        var ph = await client.GetAsync("/api/ph");
        ph.StatusCode.Should().Be(HttpStatusCode.OK);

        var memberships = await client.GetAsync("/api/ph/memberships/mine");
        memberships.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
