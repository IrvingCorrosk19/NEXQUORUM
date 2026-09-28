namespace Asambleas.Application.Abstractions;

/// <summary>
/// Server-side LiveKit publish gate for a participant microphone.
/// Moderators are not passed here; only floor holders are allowed.
/// </summary>
public interface IParticipantMicrophoneGate
{
    Task SetAllowedAsync(Guid assemblyId, Guid userId, bool allowed, CancellationToken cancellationToken = default);
}
