using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Asambleas.Application.Communications;
using Asambleas.Infrastructure.Communications;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class JoinPasswordlessRedeemTests
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly AsambleasFixture _fixture;

    public JoinPasswordlessRedeemTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Redeem_valid_token_sets_session_without_admin_elevation()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (raw, assemblyId, email) = await IssueViaSendAsync("owner101@ocean.demo");

        var client = Anon();
        var redeem = await RedeemAsync(client, raw);
        redeem.StatusCode.Should().Be(HttpStatusCode.OK);
        (await IsAuthedAsync(client)).Should().BeTrue();

        var me = await client.GetFromJsonAsync<MeDto>("/api/auth/me", JsonOpts);
        me!.Email.Should().BeEquivalentTo(email);
        me.Permissions.Should().Contain("vote:cast");
        me.Permissions.Should().NotContain("vote:open");
        me.Permissions.Should().NotContain("assembly:manage");
        me.Permissions.Should().NotContain("ph:manage");
        me.Permissions.Should().NotContain("owner:manage");

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        (await db.AssemblyParticipants.IgnoreQueryFilters()
            .CountAsync(p => p.AssemblyId == assemblyId && p.UserId == me.UserId)).Should().Be(1);
    }

    [Fact]
    public async Task Redeem_rejects_invalid_expired_revoked_without_cookie()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (raw, _, _) = await IssueViaSendAsync("owner102@ocean.demo");

        var bad = Anon();
        (await RedeemAsync(bad, "deadbeef")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await IsAuthedAsync(bad)).Should().BeFalse();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var link = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .FirstAsync(l => l.TokenHash == AssemblyAccessLinkService.HashToken(raw));
            link.ExpiresAtUtc = DateTimeOffset.UtcNow.AddHours(-1);
            await db.SaveChangesAsync();
        }

        var expired = Anon();
        (await RedeemAsync(expired, raw)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await IsAuthedAsync(expired)).Should().BeFalse();

        MockEmailProvider.Clear();
        var (raw2, _, _) = await IssueViaSendAsync("owner103@ocean.demo");
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var link = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .FirstAsync(l => l.TokenHash == AssemblyAccessLinkService.HashToken(raw2));
            link.RevokedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        }

        var revoked = Anon();
        (await RedeemAsync(revoked, raw2)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await IsAuthedAsync(revoked)).Should().BeFalse();
    }

    [Fact]
    public async Task Resend_revokes_old_token_new_token_works()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (rawA, assemblyId, email) = await IssueViaSendAsync("owner104@ocean.demo");
        var (rawB, _, _) = await ReissueAsync(email);
        rawB.Should().NotBe(rawA);

        var oldClient = Anon();
        (await RedeemAsync(oldClient, rawA)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await IsAuthedAsync(oldClient)).Should().BeFalse();

        var newClient = Anon();
        var ok = await RedeemAsync(newClient, rawB);
        ok.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await ok.Content.ReadFromJsonAsync<RedeemDto>(JsonOpts);
        dto!.AssemblyId.Should().Be(assemblyId);
    }

    [Fact]
    public async Task Cancel_assembly_revokes_links_and_blocks_redeem()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (raw, assemblyId, email) = await IssueViaSendAsync("owner105@ocean.demo");
        (await RedeemAsync(Anon(), raw)).StatusCode.Should().Be(HttpStatusCode.OK);

        var (raw2, _, _) = await ReissueAsync(email);

        // Seed Ocean assembly is InProgress; lifecycle only allows cancel from Draft/Scheduled/CheckIn.
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var asm = await db.Assemblies.IgnoreQueryFilters().FirstAsync(a => a.Id == assemblyId);
            asm.Status = Domain.Enums.AssemblyStatus.Scheduled;
            await db.SaveChangesAsync();
        }

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var cancel = await president.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/cancel",
            new { reason = "Cert QA cancel", notifyParticipants = false });
        cancel.StatusCode.Should().Be(HttpStatusCode.OK, await cancel.Content.ReadAsStringAsync());

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            (await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .CountAsync(l => l.AssemblyId == assemblyId && l.RevokedAtUtc == null)).Should().Be(0);
        }

        var blocked = Anon();
        (await RedeemAsync(blocked, raw2)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await IsAuthedAsync(blocked)).Should().BeFalse();
    }

    [Fact]
    public async Task Ocean_redeem_cannot_read_other_tenant_assembly()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (raw, _, _) = await IssueViaSendAsync("owner106@ocean.demo");
        var client = Anon();
        (await RedeemAsync(client, raw)).StatusCode.Should().Be(HttpStatusCode.OK);

        var other = await client.GetAsync($"/api/assemblies/{DemoSeedConstants.AssemblyOtherId}");
        other.StatusCode.Should().BeOneOf(HttpStatusCode.Forbidden, HttpStatusCode.NotFound, HttpStatusCode.BadRequest);
        var body = await other.Content.ReadAsStringAsync();
        body.Should().NotContain("PH OTHER");
        body.Should().NotContain(DemoSeedConstants.TenantOtherId.ToString("D"));
    }

    [Fact]
    public async Task Ingresar_entry_sets_cache_control_no_store()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (raw, _, _) = await IssueViaSendAsync("owner101@ocean.demo");
        var page = await Anon().GetAsync($"/ingresar/{raw}");
        page.StatusCode.Should().Be(HttpStatusCode.OK);
        page.Headers.CacheControl?.NoStore.Should().BeTrue();
    }

    private HttpClient Anon() =>
        _fixture.Factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            HandleCookies = true
        });

    private static async Task<bool> IsAuthedAsync(HttpClient client) =>
        (await client.GetAsync("/api/auth/me")).StatusCode == HttpStatusCode.OK;

    private async Task<(string Raw, Guid AssemblyId, string Email)> IssueViaSendAsync(string email)
    {
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var create = await president.PostJsonAsync(
            $"/api/assemblies/{DemoSeedConstants.AssemblyOceanId}/convocations",
            new
            {
                assemblyId = DemoSeedConstants.AssemblyOceanId,
                title = "Cert join",
                subject = "Convocatoria certificacion",
                bodyHtml = "<p>Cert</p>",
                bodyText = "Cert",
                channels = new[] { "Email" },
                idempotencyKey = $"cert-{Guid.NewGuid():N}"
            });
        create.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var convocationId = doc.RootElement.GetProperty("id").GetGuid();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var has = await db.ConvocationRecipients.IgnoreQueryFilters()
                .AnyAsync(r => r.ConvocationId == convocationId && r.Email == email);
            if (!has)
            {
                var owner = await db.Owners.IgnoreQueryFilters().FirstAsync(o => o.Email == email);
                db.ConvocationRecipients.Add(new Domain.Entities.ConvocationRecipient
                {
                    TenantId = DemoSeedConstants.TenantOceanId,
                    ConvocationId = convocationId,
                    Email = email,
                    DisplayName = owner.DisplayName,
                    OwnerId = owner.Id,
                    UserId = owner.UserId,
                    IsValid = true
                });
                await db.SaveChangesAsync();
            }
        }

        MockEmailProvider.Clear();
        var send = await president.PostJsonAsync(
            $"/api/convocations/{convocationId}/send",
            new { confirmed = true, idempotencyKey = $"send-{Guid.NewGuid():N}" });
        send.EnsureSuccessStatusCode();

        string? raw = null;
        for (var i = 0; i < 50 && raw is null; i++)
        {
            await Task.Delay(200);
            raw = ExtractToken(MockEmailProvider.Snapshot(), email);
        }

        if (raw is null)
        {
            // Fallback: IssueAsync if mock dispatch lagged
            await using var scope = _fixture.Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var links = scope.ServiceProvider.GetRequiredService<AssemblyAccessLinkService>();
            var convocation = await db.Convocations.IgnoreQueryFilters().FirstAsync(c => c.Id == convocationId);
            var recipient = await db.ConvocationRecipients.IgnoreQueryFilters()
                .FirstAsync(r => r.ConvocationId == convocationId && r.Email == email);
            var issued = await links.IssueAsync(convocation, recipient, null, null);
            raw = issued.RawToken;
        }

        return (raw, DemoSeedConstants.AssemblyOceanId, email);
    }

    private async Task<(string Raw, Guid AssemblyId, string Email)> ReissueAsync(string email)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var links = scope.ServiceProvider.GetRequiredService<AssemblyAccessLinkService>();
        var recipient = await db.ConvocationRecipients.IgnoreQueryFilters()
            .Where(r => r.Email == email)
            .OrderByDescending(r => r.CreatedAtUtc)
            .FirstAsync();
        var convocation = await db.Convocations.IgnoreQueryFilters()
            .FirstAsync(c => c.Id == recipient.ConvocationId);
        var issued = await links.IssueAsync(convocation, recipient, null, null);
        return (issued.RawToken, convocation.AssemblyId, email);
    }

    private static string? ExtractToken(IReadOnlyList<CapturedMockEmail> mailbox, string email)
    {
        foreach (var mail in mailbox.Reverse().Where(m => m.To.Equals(email, StringComparison.OrdinalIgnoreCase)))
        {
            var blob = $"{mail.HtmlBody}\n{mail.TextBody}";
            var m = Regex.Match(blob, @"/ingresar/([A-Za-z0-9_\-]+)", RegexOptions.IgnoreCase);
            if (m.Success)
            {
                return Uri.UnescapeDataString(m.Groups[1].Value);
            }
        }

        return null;
    }

    private static async Task<HttpResponseMessage> RedeemAsync(HttpClient client, string token)
    {
        var af = await client.GetFromJsonAsync<AfDto>("/api/auth/antiforgery", JsonOpts);
        using var req = new HttpRequestMessage(HttpMethod.Post, "/api/join/redeem")
        {
            Content = JsonContent.Create(new { token })
        };
        req.Headers.TryAddWithoutValidation("RequestVerificationToken", af!.RequestToken);
        return await client.SendAsync(req);
    }

    private sealed record AfDto(string RequestToken);
    private sealed record RedeemDto(Guid AssemblyId, string RedirectPath);
    private sealed record MeDto(
        Guid UserId,
        string DisplayName,
        string Email,
        Guid TenantId,
        string TenantCode,
        Guid? OrganizationId,
        Guid? PropertyHorizontalId,
        IReadOnlyList<string> Roles,
        IReadOnlyList<string> Permissions);
}
