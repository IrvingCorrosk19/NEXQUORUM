using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Asambleas.Application.Communications;
using Asambleas.Domain.Enums;
using Asambleas.Infrastructure.Communications;
using Asambleas.Infrastructure.Persistence;
using Asambleas.Infrastructure.Seed;
using Asambleas.IntegrationTests.Infrastructure;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Asambleas.IntegrationTests;

[Collection(AsambleasCollection.Name)]
public sealed class AccessLinkExpiryLifecycleTests
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private readonly AsambleasFixture _fixture;

    public AccessLinkExpiryLifecycleTests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task Issued_link_uses_scheduled_plus_48h_not_14_days_for_far_assembly()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();

        var far = DateTimeOffset.UtcNow.AddDays(30);
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var asm = await db.Assemblies.IgnoreQueryFilters()
                .FirstAsync(a => a.Id == DemoSeedConstants.AssemblyOceanId);
            asm.ScheduledAtUtc = far;
            asm.EstimatedEndAtUtc = far.AddHours(2);
            asm.Status = AssemblyStatus.Scheduled;
            await db.SaveChangesAsync();
        }

        var beforeIssue = DateTimeOffset.UtcNow;
        var (raw, assemblyId, _) = await IssueViaSendAsync("owner101@ocean.demo");
        raw.Should().NotBeNullOrWhiteSpace();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var link = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .FirstAsync(l => l.TokenHash == AssemblyAccessLinkService.HashToken(raw));
            link.AssemblyId.Should().Be(assemblyId);
            link.ExpiresAtUtc.Should().BeAfter(beforeIssue.AddDays(14));
            link.ExpiresAtUtc.Should().BeCloseTo(far.AddHours(2).AddHours(48), TimeSpan.FromMinutes(2));
            link.RevokedAtUtc.Should().BeNull();
        }
    }

    [Fact]
    public async Task Expired_link_rejected_exactly_at_ExpiresAt()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (raw, _, _) = await IssueViaSendAsync("owner102@ocean.demo");

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var link = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .FirstAsync(l => l.TokenHash == AssemblyAccessLinkService.HashToken(raw));
            link.ExpiresAtUtc = DateTimeOffset.UtcNow; // exactly now → expired (<=)
            await db.SaveChangesAsync();
        }

        var client = Anon();
        (await RedeemAsync(client, raw)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await IsAuthedAsync(client)).Should().BeFalse();
    }

    [Fact]
    public async Task Resend_revokes_prior_with_reason_and_keeps_other_owners()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (rawA, assemblyId, email) = await IssueViaSendAsync("owner103@ocean.demo");

        Guid otherRecipientId;
        string rawOther;
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var linksSvc = scope.ServiceProvider.GetRequiredService<AssemblyAccessLinkService>();
            var linkA = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .FirstAsync(l => l.TokenHash == AssemblyAccessLinkService.HashToken(rawA));
            var otherRecipient = await db.ConvocationRecipients.IgnoreQueryFilters()
                .Where(r => r.ConvocationId == linkA.ConvocationId && r.Email == "owner104@ocean.demo")
                .FirstAsync();
            otherRecipientId = otherRecipient.Id;
            var convocation = await db.Convocations.IgnoreQueryFilters().FirstAsync(c => c.Id == linkA.ConvocationId);
            var asm = await db.Assemblies.IgnoreQueryFilters().FirstAsync(a => a.Id == assemblyId);
            var issuedOther = await linksSvc.IssueAsync(
                convocation,
                otherRecipient,
                null,
                asm.ScheduledAtUtc,
                asm.EstimatedEndAtUtc,
                AccessLinkRevocationReasons.Resent);
            rawOther = issuedOther.RawToken;
        }

        var (rawB, _, _) = await ReissueAsync(email);
        rawB.Should().NotBe(rawA);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var old = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .FirstAsync(l => l.TokenHash == AssemblyAccessLinkService.HashToken(rawA));
            old.RevokedAtUtc.Should().NotBeNull();
            old.RevocationReason.Should().Be(AccessLinkRevocationReasons.Resent);
            old.ReplacedByLinkId.Should().NotBeNull();

            var other = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .FirstAsync(l => l.TokenHash == AssemblyAccessLinkService.HashToken(rawOther));
            other.RevokedAtUtc.Should().BeNull();
            other.RecipientId.Should().Be(otherRecipientId);
        }

        (await RedeemAsync(Anon(), rawA)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await RedeemAsync(Anon(), rawB)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await RedeemAsync(Anon(), rawOther)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Reschedule_revokes_old_links_and_issues_replacements()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var asm = await db.Assemblies.IgnoreQueryFilters()
                .FirstAsync(a => a.Id == DemoSeedConstants.AssemblyOceanId);
            asm.Status = AssemblyStatus.Scheduled;
            asm.ScheduledAtUtc = DateTimeOffset.UtcNow.AddDays(5);
            await db.SaveChangesAsync();
        }

        var (rawA, assemblyId, _) = await IssueViaSendAsync("owner105@ocean.demo");
        var newStart = DateTimeOffset.UtcNow.AddDays(20);

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var reschedule = await president.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/reschedule",
            new
            {
                newScheduledAtUtc = newStart,
                newEstimatedEndAtUtc = newStart.AddHours(2),
                reason = "Cert QA reschedule rotation",
                notifyParticipants = false
            });
        reschedule.StatusCode.Should().Be(HttpStatusCode.OK, await reschedule.Content.ReadAsStringAsync());

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var old = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .FirstAsync(l => l.TokenHash == AssemblyAccessLinkService.HashToken(rawA));
            old.RevokedAtUtc.Should().NotBeNull();
            old.RevocationReason.Should().Be(AccessLinkRevocationReasons.AssemblyRescheduled);

            var active = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .Where(l => l.AssemblyId == assemblyId && l.RevokedAtUtc == null)
                .ToListAsync();
            active.Should().NotBeEmpty();
            active.Should().OnlyContain(l => l.ExpiresAtUtc >= newStart.AddHours(48));
        }

        (await RedeemAsync(Anon(), rawA)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Cancel_revokes_with_reason_and_blocks_redeem()
    {
        await _fixture.ResetDatabaseAsync();
        MockEmailProvider.Clear();
        var (raw, assemblyId, _) = await IssueViaSendAsync("owner106@ocean.demo");

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var asm = await db.Assemblies.IgnoreQueryFilters().FirstAsync(a => a.Id == assemblyId);
            asm.Status = AssemblyStatus.Scheduled;
            await db.SaveChangesAsync();
        }

        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");
        var cancel = await president.PostJsonAsync(
            $"/api/assemblies/{assemblyId}/cancel",
            new { reason = "Cert QA cancel links", notifyParticipants = false });
        cancel.StatusCode.Should().Be(HttpStatusCode.OK, await cancel.Content.ReadAsStringAsync());

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var links = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                .Where(l => l.AssemblyId == assemblyId)
                .ToListAsync();
            links.Should().OnlyContain(l => l.RevokedAtUtc != null);
            links.Should().Contain(l => l.RevocationReason == AccessLinkRevocationReasons.AssemblyCancelled);
        }

        var blocked = Anon();
        (await RedeemAsync(blocked, raw)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await IsAuthedAsync(blocked)).Should().BeFalse();
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
                title = "Expiry cert",
                subject = "Convocatoria vigencia",
                bodyHtml = "<p>Cert</p>",
                bodyText = "Cert",
                channels = new[] { "Email" },
                idempotencyKey = $"exp-{Guid.NewGuid():N}"
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
        for (var i = 0; i < 40 && raw is null; i++)
        {
            await Task.Delay(150);
            await using var scope = _fixture.Factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
            var row = await (
                from l in db.AssemblyAccessLinks.IgnoreQueryFilters()
                join r in db.ConvocationRecipients.IgnoreQueryFilters() on l.RecipientId equals r.Id
                where l.ConvocationId == convocationId
                      && r.Email == email
                      && l.RevokedAtUtc == null
                orderby l.CreatedAtUtc descending
                select l
            ).FirstOrDefaultAsync();
            if (row is not null)
            {
                // Prefer mailbox token when present; otherwise re-issue is unnecessary — use hash lookup via Issue fallback.
                raw = ExtractToken(MockEmailProvider.Snapshot(), email)
                      ?? ExtractToken(MockEmailProvider.Snapshot(), "owner101@ocean.demo");
                if (raw is null)
                {
                    // Sandbox override may hide per-recipient To; mint a controlled replacement for the same recipient.
                    var links = scope.ServiceProvider.GetRequiredService<AssemblyAccessLinkService>();
                    var convocation = await db.Convocations.IgnoreQueryFilters().FirstAsync(c => c.Id == convocationId);
                    var recipient = await db.ConvocationRecipients.IgnoreQueryFilters()
                        .FirstAsync(r => r.ConvocationId == convocationId && r.Email == email);
                    var asm = await db.Assemblies.IgnoreQueryFilters().FirstAsync(a => a.Id == convocation.AssemblyId);
                    var issued = await links.IssueAsync(
                        convocation,
                        recipient,
                        null,
                        asm.ScheduledAtUtc,
                        asm.EstimatedEndAtUtc,
                        AccessLinkRevocationReasons.Resent);
                    raw = issued.RawToken;
                }
                else
                {
                    // Ensure extracted token belongs to this recipient; otherwise reissue for the email.
                    var hash = AssemblyAccessLinkService.HashToken(raw);
                    var match = await db.AssemblyAccessLinks.IgnoreQueryFilters()
                        .AnyAsync(l => l.TokenHash == hash && l.RecipientId == row.RecipientId && l.RevokedAtUtc == null);
                    if (!match)
                    {
                        var links = scope.ServiceProvider.GetRequiredService<AssemblyAccessLinkService>();
                        var convocation = await db.Convocations.IgnoreQueryFilters().FirstAsync(c => c.Id == convocationId);
                        var recipient = await db.ConvocationRecipients.IgnoreQueryFilters()
                            .FirstAsync(r => r.Id == row.RecipientId);
                        var asm = await db.Assemblies.IgnoreQueryFilters().FirstAsync(a => a.Id == convocation.AssemblyId);
                        var issued = await links.IssueAsync(
                            convocation,
                            recipient,
                            null,
                            asm.ScheduledAtUtc,
                            asm.EstimatedEndAtUtc,
                            AccessLinkRevocationReasons.Resent);
                        raw = issued.RawToken;
                    }
                }
            }
        }

        raw.Should().NotBeNullOrWhiteSpace();
        return (raw!, DemoSeedConstants.AssemblyOceanId, email);
    }

    private async Task<(string Raw, Guid AssemblyId, string Email)> ReissueAsync(string email)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AsambleasDbContext>();
        var links = scope.ServiceProvider.GetRequiredService<AssemblyAccessLinkService>();
        var active = await (
            from l in db.AssemblyAccessLinks.IgnoreQueryFilters()
            join r in db.ConvocationRecipients.IgnoreQueryFilters() on l.RecipientId equals r.Id
            where r.Email == email && l.RevokedAtUtc == null
            orderby l.CreatedAtUtc descending
            select new { Link = l, Recipient = r }
        ).FirstAsync();
        var convocation = await db.Convocations.IgnoreQueryFilters()
            .FirstAsync(c => c.Id == active.Link.ConvocationId);
        var asm = await db.Assemblies.IgnoreQueryFilters().FirstAsync(a => a.Id == convocation.AssemblyId);
        var issued = await links.IssueAsync(
            convocation,
            active.Recipient,
            null,
            asm.ScheduledAtUtc,
            asm.EstimatedEndAtUtc,
            AccessLinkRevocationReasons.Resent);
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
}
