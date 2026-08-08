namespace Asambleas.Infrastructure.Meeting;

using Asambleas.Application.Abstractions;
using Asambleas.Domain.Common;

/// <summary>
/// Fallback meeting provider when LiveKit is intentionally disabled.
/// </summary>
public sealed class NullMeetingProvider : IMeetingProvider
{
    public const string ProviderName = "none";

    public Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(false);
    }

    public Task<MeetingRoomInfo> EnsureRoomAsync(
        Guid assemblyId,
        string roomName,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        return Task.FromResult(new MeetingRoomInfo(
            assemblyId,
            ProviderName,
            roomName,
            IsAvailable: false,
            UnavailableReason: "Meeting provider is not configured (LiveKit credentials required)."));
    }

    public Task<MeetingJoinToken> CreateParticipantTokenAsync(
        MeetingJoinRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new DomainException("Meeting provider is not configured (LiveKit credentials required).");
    }
}
