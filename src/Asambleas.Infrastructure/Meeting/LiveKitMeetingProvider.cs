namespace Asambleas.Infrastructure.Meeting;

using Asambleas.Application.Abstractions;
using Asambleas.Domain.Common;
using Microsoft.Extensions.Options;

public sealed class LiveKitMeetingProvider : IMeetingProvider
{
    public const string ProviderName = "livekit";

    private readonly LiveKitOptions _options;

    public LiveKitMeetingProvider(IOptions<LiveKitOptions> options)
    {
        _options = options.Value;
    }

    public Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_options.IsConfigured);
    }

    public Task<MeetingRoomInfo> EnsureRoomAsync(
        Guid assemblyId,
        string roomName,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentException.ThrowIfNullOrWhiteSpace(roomName);

        if (!_options.IsConfigured)
        {
            return Task.FromResult(new MeetingRoomInfo(
                assemblyId,
                ProviderName,
                roomName,
                IsAvailable: false,
                UnavailableReason: "Meeting provider is not configured (LiveKit credentials required)."));
        }

        // LiveKit creates rooms on first join when using access tokens; no admin API required for EO-001.
        return Task.FromResult(new MeetingRoomInfo(
            assemblyId,
            ProviderName,
            roomName,
            IsAvailable: true,
            UnavailableReason: null));
    }

    public Task<MeetingJoinToken> CreateParticipantTokenAsync(
        MeetingJoinRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(request);

        if (!_options.IsConfigured)
        {
            throw new DomainException("Meeting provider is not configured (LiveKit credentials required).");
        }

        var ttl = request.Ttl ?? TimeSpan.FromHours(2);
        var identity = request.UserId.ToString("N");
        var token = LiveKitAccessToken.Create(
            _options.ApiKey,
            _options.ApiSecret,
            identity,
            request.DisplayName,
            request.RoomName,
            request.CanPublish,
            request.CanSubscribe,
            ttl,
            out var expiresAtUtc);

        return Task.FromResult(new MeetingJoinToken(
            request.AssemblyId,
            ProviderName,
            request.RoomName,
            token,
            _options.Url.TrimEnd('/'),
            expiresAtUtc));
    }
}
