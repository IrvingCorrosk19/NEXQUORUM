using System.Net.Http.Json;
using Asambleas.IntegrationTests.Infrastructure;

namespace Asambleas.E2ETests;

[Collection(AsambleasCollection.Name)]
[Trait("Category", "AutomatedMeeting")]
public sealed class AssemblyMeetingE2ETests
{
    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly (string Email, Guid UnitId)[] DemoUsers =
    [
        ("president@ocean.demo", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit107Id),
        ("secretary@ocean.demo", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit108Id),
        ("owner101@ocean.demo", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit101Id),
        ("owner102@ocean.demo", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit102Id),
        ("owner103@ocean.demo", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit103Id),
        ("owner104@ocean.demo", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit104Id),
        ("owner105@ocean.demo", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit105Id),
        ("owner106@ocean.demo", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit106Id)
    ];

    private readonly AsambleasFixture _fixture;

    public AssemblyMeetingE2ETests(AsambleasFixture fixture) => _fixture = fixture;

    [Fact(DisplayName = "E2E-001 Login 8 demo users")]
    public async Task E2E001_Login_eight_users()
    {
        await _fixture.ResetDatabaseAsync();

        foreach (var (email, _) in DemoUsers)
        {
            var session = await AuthenticatedClient.LoginAsync(_fixture.Factory, email);
            session.User.Email.Should().Be(email);
            session.User.TenantId.Should().Be(Asambleas.Infrastructure.Seed.DemoSeedConstants.TenantOceanId);
        }
    }

    [Fact(DisplayName = "E2E-002..011 Join, check-in, speaker, agenda, motion, voting, reconnect, tenant attack")]
    public async Task E2E002_through_011_assembly_flow()
    {
        await _fixture.ResetDatabaseAsync();

        var seeds = Asambleas.Infrastructure.Seed.DemoSeedConstants.AssemblyOceanId;
        var president = await AuthenticatedClient.LoginAsync(_fixture.Factory, "president@ocean.demo");

        (await president.PostAsync($"/api/assemblies/{seeds}/start-checkin")).EnsureSuccessStatusCode();

        foreach (var (email, unitId) in DemoUsers)
        {
            var user = await AuthenticatedClient.LoginAsync(_fixture.Factory, email);
            var checkIn = await user.PostJsonAsync(
                $"/api/assemblies/{seeds}/attendance/check-in",
                new Asambleas.Contracts.Assemblies.CheckInRequest(unitId, "Virtual"));
            checkIn.EnsureSuccessStatusCode();
        }

        (await president.PostAsync($"/api/assemblies/{seeds}/start")).EnsureSuccessStatusCode();

        var owner103 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner103@ocean.demo");
        var speakerReq = await owner103.PostJsonAsync(
            $"/api/assemblies/{seeds}/speakers/request",
            new Asambleas.Contracts.Speakers.CreateSpeakerRequest(null));
        speakerReq.EnsureSuccessStatusCode();
        var speaker = (await speakerReq.Content.ReadFromJsonAsync<Asambleas.Contracts.Speakers.SpeakerRequestDto>(JsonOptions))!;

        (await president.PostAsync($"/api/assemblies/{seeds}/speakers/{speaker.Id}/grant"))
            .EnsureSuccessStatusCode();

        (await president.PostJsonAsync(
            $"/api/assemblies/{seeds}/agenda/active",
            new Asambleas.Contracts.Agenda.ActivateAgendaItemRequest(
                Asambleas.Infrastructure.Seed.DemoSeedConstants.Agenda03Id)))
            .EnsureSuccessStatusCode();

        (await president.PostJsonAsync(
            $"/api/assemblies/{seeds}/motions/present",
            new Asambleas.Contracts.Motions.PresentMotionRequest(
                Asambleas.Infrastructure.Seed.DemoSeedConstants.Motion001Id)))
            .EnsureSuccessStatusCode();

        var openVote = await president.PostJsonAsync(
            $"/api/assemblies/{seeds}/voting/open",
            new Asambleas.Contracts.Voting.OpenVotingSessionRequest(
                Asambleas.Infrastructure.Seed.DemoSeedConstants.Motion001Id, false));
        openVote.EnsureSuccessStatusCode();
        var session = (await openVote.Content.ReadFromJsonAsync<Asambleas.Contracts.Voting.VotingSessionDto>(JsonOptions))!;

        var owner101 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner101@ocean.demo");
        (await owner101.PostJsonAsync(
            $"/api/assemblies/{seeds}/voting/{session.Id}/cast",
            new Asambleas.Contracts.Voting.CastVoteRequest(
                "InFavor", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit101Id)))
            .EnsureSuccessStatusCode();

        var cast2 = await owner101.PostJsonAsync(
            $"/api/assemblies/{seeds}/voting/{session.Id}/cast",
            new Asambleas.Contracts.Voting.CastVoteRequest(
                "Against", Asambleas.Infrastructure.Seed.DemoSeedConstants.Unit101Id));
        cast2.IsSuccessStatusCode.Should().BeFalse();

        var close = await president.PostAsync($"/api/assemblies/{seeds}/voting/{session.Id}/close");
        close.EnsureSuccessStatusCode();
        var closed = (await close.Content.ReadFromJsonAsync<Asambleas.Contracts.Voting.CloseVotingSessionResponse>(JsonOptions))!;
        closed.MotionStatus.Should().BeOneOf("Approved", "Rejected");

        (await owner101.GetAsync($"/api/assemblies/{seeds}/voting/{session.Id}/results"))
            .EnsureSuccessStatusCode();

        var owner104 = await AuthenticatedClient.LoginAsync(_fixture.Factory, "owner104@ocean.demo");
        (await owner104.GetAsync("/api/auth/me")).EnsureSuccessStatusCode();
        (await owner104.GetAsync($"/api/assemblies/{seeds}")).EnsureSuccessStatusCode();

        var attack = await owner104.GetAsync(
            $"/api/assemblies/{Asambleas.Infrastructure.Seed.DemoSeedConstants.AssemblyOtherId}");
        attack.IsSuccessStatusCode.Should().BeFalse();
        (await attack.Content.ReadAsStringAsync()).Should().NotContain("PH OTHER");
    }

    [Fact(DisplayName = "LiveKit video room — manual", Skip = "BLOCKED — LIVEKIT CREDENTIALS REQUIRED")]
    [Trait("Category", "Manual")]
    public void LiveKit_video_manual()
    {
    }
}
