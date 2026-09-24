using System.Net;
using System.Net.Http.Json;
using Asambleas.Contracts.Auth;
using Asambleas.Infrastructure.Communications;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class EmailLoginOtpTests
{
    private readonly AsambleasFixture _fixture;
    public EmailLoginOtpTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Request_returns_generic_accepted_for_unknown_email()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var client = _fixture.Factory.CreateClient();
        var res = await client.PostAsJsonAsync(
            "/api/auth/email-otp/request",
            new EmailOtpRequestDto("nobody-unknown@example.test"));
        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await res.Content.ReadFromJsonAsync<EmailOtpRequestResponse>();
        body!.Accepted.Should().BeTrue();
        body.DeliveryConfirmed.Should().BeFalse();
        body.Detail.Should().Contain("recibirás");
        MockEmailProvider.Snapshot().Should().BeEmpty();
    }

    [Fact]
    public async Task Owner_with_active_relation_can_request_and_verify_otp()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var client = _fixture.Factory.CreateClient(
            new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true
            });

        var email = "owner101@ocean.demo";
        var req = await client.PostAsJsonAsync(
            "/api/auth/email-otp/request",
            new EmailOtpRequestDto(email, "/lobby.html?assemblyId=" + DemoSeedConstants.AssemblyOceanId));
        req.EnsureSuccessStatusCode();
        var accepted = await req.Content.ReadFromJsonAsync<EmailOtpRequestResponse>();
        accepted!.Accepted.Should().BeTrue();
        accepted.DeliveryConfirmed.Should().BeTrue();
        accepted.Detail.Should().Contain("Código enviado");

        var captured = MockEmailProvider.Snapshot().LastOrDefault(m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase));
        captured.Should().NotBeNull("OTP email should be sent for seeded owner");
        var code = ExtractSixDigitCode(captured!.TextBody ?? captured.HtmlBody ?? "");
        code.Should().HaveLength(6);

        var verify = await client.PostAsJsonAsync(
            "/api/auth/email-otp/verify",
            new EmailOtpVerifyDto(email, code));
        verify.StatusCode.Should().Be(HttpStatusCode.OK);
        var outcome = await verify.Content.ReadFromJsonAsync<EmailOtpVerifyResponse>();
        outcome!.Succeeded.Should().BeTrue();
        outcome.User.Should().NotBeNull();
        outcome.ReturnUrl.Should().NotBeNullOrWhiteSpace();
        outcome.ReturnUrl.Should().StartWith("/assembly.html?assemblyId=");
        outcome.ReturnUrl.Should().NotContain("/lobby.html");

        var me = await client.GetAsync("/api/auth/me");
        me.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Request_does_not_claim_delivery_when_provider_rejects()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        MockEmailProvider.ForceFailure = true;
        try
        {
            var client = _fixture.Factory.CreateClient();
            var email = "owner101@ocean.demo";
            var res = await client.PostAsJsonAsync("/api/auth/email-otp/request", new EmailOtpRequestDto(email));
            res.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await res.Content.ReadFromJsonAsync<EmailOtpRequestResponse>();
            body!.Accepted.Should().BeFalse();
            body.DeliveryConfirmed.Should().BeFalse();
            body.ErrorCode.Should().Be("SEND_FAILED");
            body.Detail.Should().Contain("No pudimos enviar");
            body.ResendAvailableAtUtc.Should().BeNull();

            using var scope = _fixture.Factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var challenges = await db.EmailLoginChallenges.IgnoreQueryFilters()
                .Where(c => c.EmailNormalized == email)
                .ToListAsync();
            challenges.Should().NotBeEmpty();
            challenges.All(c => c.ExpiresAtUtc <= DateTimeOffset.UtcNow).Should().BeTrue();
        }
        finally
        {
            MockEmailProvider.ForceFailure = false;
        }
    }

    [Fact]
    public async Task Verify_without_returnUrl_defaults_to_assembly_room()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var client = _fixture.Factory.CreateClient(
            new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true
            });

        var email = "owner101@ocean.demo";
        (await client.PostAsJsonAsync("/api/auth/email-otp/request", new EmailOtpRequestDto(email)))
            .EnsureSuccessStatusCode();
        var captured = MockEmailProvider.Snapshot().Last(m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase));
        var code = ExtractSixDigitCode(captured.TextBody ?? captured.HtmlBody ?? "");

        var verify = await client.PostAsJsonAsync(
            "/api/auth/email-otp/verify",
            new EmailOtpVerifyDto(email, code));
        verify.EnsureSuccessStatusCode();
        var outcome = await verify.Content.ReadFromJsonAsync<EmailOtpVerifyResponse>();
        outcome!.Succeeded.Should().BeTrue();
        outcome.ReturnUrl.Should().StartWith("/assembly.html?");
    }

    [Fact]
    public async Task Resend_invalidates_previous_code()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var client = _fixture.Factory.CreateClient();
        var email = "owner103@ocean.demo";

        (await client.PostAsJsonAsync("/api/auth/email-otp/request", new EmailOtpRequestDto(email)))
            .EnsureSuccessStatusCode();
        var first = ExtractSixDigitCode(
            MockEmailProvider.Snapshot().Last(m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase)).TextBody ?? "");

        // Bypass UI 60s cooldown by posting request again after mutating LastSentAt in DB via second request
        // after waiting is not practical in CI; service invalidates on new challenge when cooldown elapsed.
        // Force via direct second request after clearing cooldown is covered by service: we call request twice
        // by using a second email cycle with the same mailbox after first challenge is aged in-process.
        // Instead: verify first code fails after a successful second issue when cooldown allows.
        // Use DbContext to age LastSentAtUtc.
        using (var scope = _fixture.Factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var challenges = await db.EmailLoginChallenges.IgnoreQueryFilters()
                .Where(c => c.EmailNormalized == email)
                .ToListAsync();
            foreach (var c in challenges)
            {
                c.LastSentAtUtc = DateTimeOffset.UtcNow.AddMinutes(-2);
            }

            await db.SaveChangesAsync();
        }

        MockEmailProvider.Clear();
        (await client.PostAsJsonAsync("/api/auth/email-otp/request", new EmailOtpRequestDto(email)))
            .EnsureSuccessStatusCode();
        var second = ExtractSixDigitCode(
            MockEmailProvider.Snapshot().Last(m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase)).TextBody ?? "");
        second.Should().HaveLength(6);
        second.Should().NotBe(first);

        var reuseOld = await client.PostAsJsonAsync(
            "/api/auth/email-otp/verify",
            new EmailOtpVerifyDto(email, first));
        reuseOld.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var ok = await client.PostAsJsonAsync(
            "/api/auth/email-otp/verify",
            new EmailOtpVerifyDto(email, second));
        ok.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Max_attempts_blocks_further_guesses()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var client = _fixture.Factory.CreateClient();
        var email = "owner104@ocean.demo";
        (await client.PostAsJsonAsync("/api/auth/email-otp/request", new EmailOtpRequestDto(email)))
            .EnsureSuccessStatusCode();
        var code = ExtractSixDigitCode(
            MockEmailProvider.Snapshot().Last(m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase)).TextBody ?? "");

        for (var i = 0; i < 5; i++)
        {
            var bad = await client.PostAsJsonAsync(
                "/api/auth/email-otp/verify",
                new EmailOtpVerifyDto(email, "000000"));
            bad.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        var late = await client.PostAsJsonAsync(
            "/api/auth/email-otp/verify",
            new EmailOtpVerifyDto(email, code));
        late.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Wrong_code_is_rejected_without_session()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var client = _fixture.Factory.CreateClient();
        var email = "owner101@ocean.demo";
        (await client.PostAsJsonAsync("/api/auth/email-otp/request", new EmailOtpRequestDto(email)))
            .EnsureSuccessStatusCode();

        var bad = await client.PostAsJsonAsync(
            "/api/auth/email-otp/verify",
            new EmailOtpVerifyDto(email, "000000"));
        bad.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var me = await client.GetAsync("/api/auth/me");
        me.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Code_cannot_be_reused()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var client = _fixture.Factory.CreateClient(
            new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true
            });
        var email = "owner102@ocean.demo";
        (await client.PostAsJsonAsync("/api/auth/email-otp/request", new EmailOtpRequestDto(email)))
            .EnsureSuccessStatusCode();
        var captured = MockEmailProvider.Snapshot().Last(m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase));
        var code = ExtractSixDigitCode(captured.TextBody ?? "");

        (await client.PostAsJsonAsync("/api/auth/email-otp/verify", new EmailOtpVerifyDto(email, code)))
            .EnsureSuccessStatusCode();

        var client2 = _fixture.Factory.CreateClient();
        var again = await client2.PostAsJsonAsync(
            "/api/auth/email-otp/verify",
            new EmailOtpVerifyDto(email, code));
        again.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    private static string ExtractSixDigitCode(string body)
    {
        var digits = System.Text.RegularExpressions.Regex.Match(body, @"\b(\d{6})\b");
        return digits.Success ? digits.Groups[1].Value : "";
    }
}
