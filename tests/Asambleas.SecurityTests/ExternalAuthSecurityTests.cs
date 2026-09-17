using System.Net;
using System.Net.Http.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Security;
using Asambleas.Domain.Entities;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Identity;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.SecurityTests;

[Collection(AsambleasCollection.Name)]
public sealed class ExternalAuthSecurityTests
{
    private readonly AsambleasFixture _fixture;

    public ExternalAuthSecurityTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Providers_endpoint_reports_disabled_without_secrets()
    {
        var client = _fixture.Factory.CreateClient();
        var response = await client.GetAsync("/api/auth/external/providers");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<ProvidersDto>();
        body.Should().NotBeNull();
        body!.Google.Should().BeFalse();
        body.Microsoft.Should().BeFalse();
    }

    [Fact]
    public async Task Challenge_without_config_returns_503()
    {
        var client = _fixture.Factory.CreateClient();
        var response = await client.GetAsync("/api/auth/external/Google/challenge?returnUrl=/owner.html");
        response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task Challenge_with_config_rejects_external_returnUrl_and_challenges()
    {
        await using var factory = new ExternalAuthConfiguredFactory(_fixture.Factory.ConnectionString);
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var response = await client.GetAsync(
            "/api/auth/external/Google/challenge?returnUrl=https://evil.example/phish");

        // Provider challenge issues a redirect to Google (or 302/307). Never echo the evil host.
        response.StatusCode.Should().BeOneOf(
            HttpStatusCode.Redirect,
            HttpStatusCode.Found,
            HttpStatusCode.RedirectKeepVerb,
            HttpStatusCode.TemporaryRedirect);
        response.Headers.Location.Should().NotBeNull();
        var location = response.Headers.Location!.ToString();
        location.Should().Contain("accounts.google.com");
        location.ToLowerInvariant().Should().NotContain("evil.example");
    }

    [Fact]
    public async Task Callback_without_external_ticket_redirects_cancelled()
    {
        var client = _fixture.Factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        var response = await client.GetAsync("/api/auth/external/Google/callback");
        response.StatusCode.Should().BeOneOf(HttpStatusCode.Redirect, HttpStatusCode.Found, HttpStatusCode.SeeOther);
        response.Headers.Location.Should().NotBeNull();
        response.Headers.Location!.ToString().Should().Contain("oauth_error=cancelled");
    }

    [Fact]
    public async Task Password_login_regression_still_works()
    {
        // Avoid auth-login rate-limit collisions from sibling HTTP challenge tests in this class.
        await _fixture.ResetDatabaseAsync();
        await Task.Delay(1100);
        var auth = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        auth.User.Email.Should().Be("president@ocean.demo");
        var me = await auth.Client.GetAsync("/api/auth/me");
        me.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task CompleteExternalLogin_no_association_is_rejected()
    {
        await _fixture.ResetDatabaseAsync();
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var svc = scope.ServiceProvider.GetRequiredService<ExternalAuthService>();

        var outcome = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Google", "sub-orphan-1", "orphan-oauth@example.com", true, "Orphan"),
            authenticatedUserId: null);

        outcome.Succeeded.Should().BeFalse();
        outcome.ErrorCode.Should().Be("NO_ASSOCIATION");
        outcome.Message.Should().Contain("todavía no está asociada");
    }

    [Fact]
    public async Task CompleteExternalLogin_unverified_email_is_rejected()
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var svc = scope.ServiceProvider.GetRequiredService<ExternalAuthService>();

        var outcome = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Google", "sub-uv", "x@gmail.com", false, "X"),
            authenticatedUserId: null);

        outcome.Succeeded.Should().BeFalse();
        outcome.ErrorCode.Should().Be("EMAIL_NOT_VERIFIED");
    }

    [Fact]
    public async Task CompleteExternalLogin_existing_password_account_requires_explicit_link()
    {
        await _fixture.ResetDatabaseAsync();
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var svc = scope.ServiceProvider.GetRequiredService<ExternalAuthService>();

        var president = await users.FindByEmailAsync("president@ocean.demo");
        president.Should().NotBeNull();

        var outcome = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Google", "sub-pres-1", "president@ocean.demo", true, "President"),
            authenticatedUserId: null);

        outcome.Succeeded.Should().BeFalse();
        outcome.ErrorCode.Should().Be("ACCOUNT_EXISTS");
    }

    [Fact]
    public async Task CompleteExternalLogin_links_when_session_authenticated_and_email_matches()
    {
        await _fixture.ResetDatabaseAsync();
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var svc = scope.ServiceProvider.GetRequiredService<ExternalAuthService>();

        var president = await users.FindByEmailAsync("president@ocean.demo");
        president.Should().NotBeNull();

        var outcome = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Microsoft", "ms-pres-1", "president@ocean.demo", true, "President"),
            authenticatedUserId: president!.Id);

        outcome.Succeeded.Should().BeTrue();
        outcome.Linked.Should().BeTrue();

        var again = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Microsoft", "ms-pres-1", "president@ocean.demo", true, "President"),
            authenticatedUserId: null);

        again.Succeeded.Should().BeTrue();
        again.User!.Id.Should().Be(president.Id);
        again.Linked.Should().BeFalse();
    }

    [Fact]
    public async Task CompleteExternalLogin_invite_email_mismatch_does_not_link_foreign_invite()
    {
        await _fixture.ResetDatabaseAsync();
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var svc = scope.ServiceProvider.GetRequiredService<ExternalAuthService>();

        var ownerId = Guid.NewGuid();
        db.Owners.Add(new Owner
        {
            Id = ownerId,
            TenantId = DemoSeedConstants.TenantOceanId,
            RegisteredPropertyHorizontalId = DemoSeedConstants.PhOceanId,
            Email = "invitee@ocean.demo",
            DisplayName = "Invitee",
            Status = OwnerLifecycleStatus.Invited
        });
        db.OwnerInvitations.Add(new OwnerInvitation
        {
            Id = Guid.NewGuid(),
            TenantId = DemoSeedConstants.TenantOceanId,
            PropertyHorizontalId = DemoSeedConstants.PhOceanId,
            OwnerId = ownerId,
            Email = "invitee@ocean.demo",
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddDays(7),
            TokenHash = "test-hash"
        });
        await db.SaveChangesAsync();

        var outcome = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Google", "sub-other", "different@gmail.com", true, "Diff"),
            authenticatedUserId: null);

        outcome.Succeeded.Should().BeFalse();
        outcome.ErrorCode.Should().Be("NO_ASSOCIATION");
    }

    [Fact]
    public async Task CompleteExternalLogin_matching_invite_provisions_owner_without_admin_roles()
    {
        await _fixture.ResetDatabaseAsync();
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var svc = scope.ServiceProvider.GetRequiredService<ExternalAuthService>();

        var ownerId = Guid.NewGuid();
        db.Owners.Add(new Owner
        {
            Id = ownerId,
            TenantId = DemoSeedConstants.TenantOceanId,
            RegisteredPropertyHorizontalId = DemoSeedConstants.PhOceanId,
            Email = "oauth-invite@ocean.demo",
            DisplayName = "Invitee",
            Status = OwnerLifecycleStatus.Invited
        });
        db.OwnerInvitations.Add(new OwnerInvitation
        {
            Id = Guid.NewGuid(),
            TenantId = DemoSeedConstants.TenantOceanId,
            PropertyHorizontalId = DemoSeedConstants.PhOceanId,
            OwnerId = ownerId,
            Email = "oauth-invite@ocean.demo",
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddDays(7),
            TokenHash = "oauth-invite-hash"
        });
        await db.SaveChangesAsync();

        var outcome = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Google", "gmail-invite-1", "oauth-invite@ocean.demo", true, "Invitee"),
            authenticatedUserId: null);

        outcome.Succeeded.Should().BeTrue();
        outcome.User.Should().NotBeNull();

        var roles = await users.GetRolesAsync(outcome.User!);
        roles.Should().NotContain(r => r.Contains("Admin", StringComparison.OrdinalIgnoreCase));
        roles.Should().Contain(Roles.Owner);

        var login = await users.FindByLoginAsync("Google", "gmail-invite-1");
        login!.Id.Should().Be(outcome.User!.Id);
    }

    [Fact]
    public async Task CompleteExternalLogin_locked_user_is_rejected()
    {
        await _fixture.ResetDatabaseAsync();
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var svc = scope.ServiceProvider.GetRequiredService<ExternalAuthService>();

        var president = await users.FindByEmailAsync("president@ocean.demo");
        president.Should().NotBeNull();
        await users.SetLockoutEnabledAsync(president!, true);
        await users.SetLockoutEndDateAsync(president!, DateTimeOffset.UtcNow.AddHours(2));
        await users.AddLoginAsync(president!, new UserLoginInfo("Google", "locked-sub", "Google"));

        var outcome = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Google", "locked-sub", "president@ocean.demo", true, "President"),
            authenticatedUserId: null);

        outcome.Succeeded.Should().BeFalse();
        outcome.ErrorCode.Should().Be("USER_DISABLED");
    }

    [Fact]
    public async Task CompleteExternalLogin_inactive_owner_relation_is_rejected()
    {
        await _fixture.ResetDatabaseAsync();
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var identity = scope.ServiceProvider.GetRequiredService<IOwnerPortalIdentityService>();
        var svc = scope.ServiceProvider.GetRequiredService<ExternalAuthService>();

        var userId = await identity.EnsureOwnerUserPasswordlessAsync(
            DemoSeedConstants.TenantOceanId,
            null,
            "inactive-oauth@ocean.demo",
            "Inactive OAuth");

        db.Owners.Add(new Owner
        {
            Id = Guid.NewGuid(),
            TenantId = DemoSeedConstants.TenantOceanId,
            RegisteredPropertyHorizontalId = DemoSeedConstants.PhOceanId,
            Email = "inactive-oauth@ocean.demo",
            DisplayName = "Inactive OAuth",
            Status = OwnerLifecycleStatus.Inactive,
            UserId = userId
        });
        await db.SaveChangesAsync();

        var user = await users.FindByIdAsync(userId.ToString());
        await users.AddLoginAsync(user!, new UserLoginInfo("Google", "inactive-sub", "Google"));

        var outcome = await svc.CompleteExternalLoginAsync(
            new ExternalAuthPrincipal("Google", "inactive-sub", "inactive-oauth@ocean.demo", true, "Inactive"),
            authenticatedUserId: null);

        outcome.Succeeded.Should().BeFalse();
        outcome.ErrorCode.Should().Be("RELATION_INACTIVE");
    }

    [Fact]
    public async Task Unlink_requires_auth()
    {
        var client = _fixture.Factory.CreateClient();
        var response = await client.PostAsync("/api/auth/external/Google/unlink", null);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    private sealed record ProvidersDto(bool Google, bool Microsoft);
}

/// <summary>Factory with dummy OAuth client IDs so Challenge can redirect to the provider.</summary>
file sealed class ExternalAuthConfiguredFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString;

    public ExternalAuthConfiguredFactory(string connectionString) => _connectionString = connectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = _connectionString,
                ["Demo:Enabled"] = "true",
                ["Demo:PublicUserList"] = "true",
                ["Demo:SeedUsers"] = "false",
                ["Demo:RotatePasswords"] = "false",
                ["Demo:Password"] = TestDemoCredentials.Password,
                ["ASAMBLEAS_APPLY_MIGRATIONS"] = "false",
                ["ASAMBLEAS_ALLOW_INSECURE_LOGIN"] = "true",
                ["Authentication:Google:ClientId"] = "test-google-client-id.apps.googleusercontent.com",
                ["Authentication:Google:ClientSecret"] = "test-google-secret",
                ["Authentication:Microsoft:ClientId"] = "00000000-0000-0000-0000-000000000001",
                ["Authentication:Microsoft:ClientSecret"] = "test-ms-secret"
            });
        });
    }
}
