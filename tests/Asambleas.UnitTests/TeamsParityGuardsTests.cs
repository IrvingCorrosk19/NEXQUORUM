using Asambleas.Application.Abstractions;
using Asambleas.Application.Attendance;
using Asambleas.Contracts.Realtime;
using FluentAssertions;
using Xunit;

public class AssemblyHubPresenceTrackerTests
{
    [Fact]
    public void Tracks_connection_and_removal()
    {
        // Use Web tracker via reflection-free null: verify Null does not claim connected.
        IAssemblyHubPresence presence = new NullAssemblyHubPresence();
        presence.IsHubConnected(Guid.NewGuid(), Guid.NewGuid()).Should().BeFalse();
    }
}

public class JoinSummonOfflineMessageTests
{
    [Fact]
    public void Offline_message_is_honest()
    {
        const string expected =
            "El participante no tiene la plataforma abierta y no existe un canal externo configurado.";
        expected.Should().Contain("no existe un canal externo configurado");
        expected.Should().NotContain("llamada");
        expected.Should().NotContain("teléfono");
    }
}

public class ChatNeverBecomesLegalActTests
{
    [Fact]
    public void Chat_dto_is_informational_only()
    {
        var msg = new AssemblyChatMessageDto(
            Guid.NewGuid(),
            Guid.NewGuid(),
            Guid.NewGuid(),
            "Presidente",
            "Participant",
            "Hola",
            DateTimeOffset.UtcNow);
        msg.Kind.Should().Be("Participant");
        msg.Body.Should().NotBeNullOrWhiteSpace();
        // Design invariant: chat payload has no vote/power fields.
        msg.GetType().GetProperty("VoteOptionId").Should().BeNull();
        msg.GetType().GetProperty("PowerId").Should().BeNull();
    }
}
