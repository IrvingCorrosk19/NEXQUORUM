using System.Security.Claims;
using Asambleas.Application.Communications;
using Asambleas.Application.Security;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Identity;
using FluentAssertions;

namespace Asambleas.UnitTests.Security;

public sealed class SafeReturnUrlTests
{
    [Theory]
    [InlineData("/owner.html")]
    [InlineData("/assembly.html?id=1")]
    [InlineData("/join/abc")]
    public void Normalize_allows_internal_relative_paths(string url)
    {
        SafeReturnUrl.Normalize(url).Should().Be(url);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("https://evil.example/phish")]
    [InlineData("//evil.example")]
    [InlineData("/\\evil")]
    [InlineData("javascript:alert(1)")]
    [InlineData("/ok?x=javascript:alert(1)")]
    [InlineData("data:text/html,hi")]
    [InlineData("owner.html")]
    [InlineData("\\owner.html")]
    public void Normalize_blocks_external_or_dangerous_urls(string? url)
    {
        SafeReturnUrl.Normalize(url).Should().BeNull();
    }
}

public sealed class ParticipantRoomRedirectTests
{
    [Fact]
    public void PreferParticipantRoomOverLobby_rewrites_lobby_paths()
    {
        var id = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        AssemblyAccessLinkService.PreferParticipantRoomOverLobby($"/lobby.html?assemblyId={id:D}")
            .Should().Be($"/assembly.html?assemblyId={id:D}");
        AssemblyAccessLinkService.PreferParticipantRoomOverLobby("/owner.html")
            .Should().Be("/owner.html");
    }

    [Fact]
    public void ResolveParticipantRoomRedirect_uses_assembly_for_live_statuses()
    {
        var id = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        AssemblyAccessLinkService.ResolveParticipantRoomRedirect(AssemblyStatus.InProgress, id)
            .Should().StartWith("/assembly.html?");
        AssemblyAccessLinkService.ResolveParticipantRoomRedirect(AssemblyStatus.Scheduled, id)
            .Should().StartWith("/assembly.html?");
        AssemblyAccessLinkService.ResolveParticipantRoomRedirect(AssemblyStatus.Completed, id)
            .Should().Contain("dashboard.html");
    }
}

public sealed class ExternalAuthPrincipalParsingTests
{
    [Fact]
    public void TryParsePrincipal_requires_verified_google_email()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, "google-sub-1"),
            new Claim(ClaimTypes.Email, "Owner@Example.COM"),
            new Claim("email_verified", "true"),
            new Claim(ClaimTypes.Name, "Owner Demo")
        ], "Google"));

        var parsed = ExternalAuthService.TryParsePrincipal("Google", principal);
        parsed.Should().NotBeNull();
        parsed!.Provider.Should().Be("Google");
        parsed.ProviderSubject.Should().Be("google-sub-1");
        parsed.Email.Should().Be("owner@example.com");
        parsed.EmailVerified.Should().BeTrue();
    }

    [Fact]
    public void TryParsePrincipal_rejects_unverified_google_email()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, "google-sub-2"),
            new Claim(ClaimTypes.Email, "a@gmail.com"),
            new Claim("email_verified", "false")
        ], "Google"));

        var parsed = ExternalAuthService.TryParsePrincipal("Google", principal);
        parsed.Should().NotBeNull();
        parsed!.EmailVerified.Should().BeFalse();
        ExternalAuthService.IsEmailVerified(principal).Should().BeFalse();
    }

    [Fact]
    public void Microsoft_issuer_treats_email_claim_as_verified()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, "ms-oid"),
            new Claim("preferred_username", "user@outlook.com"),
            new Claim("iss", "https://login.microsoftonline.com/consumers/v2.0")
        ], "Microsoft"));

        ExternalAuthService.IsEmailVerified(principal).Should().BeTrue();
        var parsed = ExternalAuthService.TryParsePrincipal("Microsoft", principal);
        parsed.Should().NotBeNull();
        parsed!.Email.Should().Be("user@outlook.com");
        parsed.EmailVerified.Should().BeTrue();
    }

    [Fact]
    public void TryParsePrincipal_returns_null_without_subject_or_email()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.Email, "alone@example.com"),
            new Claim("email_verified", "true")
        ], "Google"));

        ExternalAuthService.TryParsePrincipal("Google", principal).Should().BeNull();
    }

    [Theory]
    [InlineData("Google", true)]
    [InlineData("google", true)]
    [InlineData("Microsoft", true)]
    [InlineData("microsoft", true)]
    [InlineData("Facebook", false)]
    [InlineData("", false)]
    public void IsSupportedProvider(string provider, bool expected) =>
        ExternalAuthService.IsSupportedProvider(provider).Should().Be(expected);
}
