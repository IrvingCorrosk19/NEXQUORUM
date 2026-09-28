namespace Asambleas.Infrastructure.Meeting;

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Asambleas.Application.Abstractions;
using Asambleas.Application.Meeting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

/// <summary>
/// Updates LiveKit participant permissions so a browser cannot publish a microphone
/// unless this server allowlists the MICROPHONE source.
/// </summary>
public sealed class LiveKitParticipantMicrophoneGate : IParticipantMicrophoneGate
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly LiveKitOptions _options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<LiveKitParticipantMicrophoneGate> _logger;

    public LiveKitParticipantMicrophoneGate(
        IOptions<LiveKitOptions> options,
        IHttpClientFactory httpClientFactory,
        ILogger<LiveKitParticipantMicrophoneGate> logger)
    {
        _options = options.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task SetAllowedAsync(
        Guid assemblyId,
        Guid userId,
        bool allowed,
        CancellationToken cancellationToken = default)
    {
        if (!_options.IsConfigured || userId == Guid.Empty)
        {
            return;
        }

        var httpBase = ToHttpBase(_options.Url);
        if (httpBase is null)
        {
            return;
        }

        var roomName = MeetingService.CanonicalRoomName(assemblyId);
        var identityPrefix = userId.ToString("N");

        try
        {
            var client = _httpClientFactory.CreateClient("livekit-room");
            var participants = await ListParticipantsAsync(client, httpBase, roomName, cancellationToken);
            foreach (var participant in participants)
            {
                if (!IsUserIdentity(participant.Identity, identityPrefix))
                {
                    continue;
                }

                await UpdatePermissionAsync(client, httpBase, roomName, participant.Identity, allowed, cancellationToken);
                if (!allowed)
                {
                    foreach (var trackSid in participant.MicrophoneTrackSids)
                    {
                        await MuteTrackAsync(client, httpBase, roomName, participant.Identity, trackSid, cancellationToken);
                    }
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(
                ex,
                "LiveKit microphone gate failed for assembly {AssemblyId} user {UserId} allowed={Allowed}",
                assemblyId,
                userId,
                allowed);
        }
    }

    private async Task<IReadOnlyList<RoomParticipant>> ListParticipantsAsync(
        HttpClient client,
        string httpBase,
        string roomName,
        CancellationToken cancellationToken)
    {
        using var response = await SendAsync(
            client,
            httpBase,
            "/twirp/livekit.RoomService/ListParticipants",
            new { room = roomName },
            roomName,
            cancellationToken);

        if (response is null || !response.IsSuccessStatusCode)
        {
            return [];
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("participants", out var list)
            || list.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var result = new List<RoomParticipant>();
        foreach (var item in list.EnumerateArray())
        {
            var identity = ReadString(item, "identity");
            if (string.IsNullOrWhiteSpace(identity))
            {
                continue;
            }

            var tracks = new List<string>();
            if (item.TryGetProperty("tracks", out var trackList) && trackList.ValueKind == JsonValueKind.Array)
            {
                foreach (var track in trackList.EnumerateArray())
                {
                    if (!IsMicrophoneTrack(track))
                    {
                        continue;
                    }

                    var sid = ReadString(track, "sid");
                    if (!string.IsNullOrWhiteSpace(sid))
                    {
                        tracks.Add(sid);
                    }
                }
            }

            result.Add(new RoomParticipant(identity, tracks));
        }

        return result;
    }

    private async Task UpdatePermissionAsync(
        HttpClient client,
        string httpBase,
        string roomName,
        string identity,
        bool allowMicrophone,
        CancellationToken cancellationToken)
    {
        var sources = new List<string> { "CAMERA" };
        if (allowMicrophone)
        {
            sources.Add("MICROPHONE");
        }

        using var response = await SendAsync(
            client,
            httpBase,
            "/twirp/livekit.RoomService/UpdateParticipant",
            new
            {
                room = roomName,
                identity,
                permission = new
                {
                    canSubscribe = true,
                    canPublish = true,
                    canPublishData = true,
                    canPublishSources = sources
                }
            },
            roomName,
            cancellationToken);
    }

    private async Task MuteTrackAsync(
        HttpClient client,
        string httpBase,
        string roomName,
        string identity,
        string trackSid,
        CancellationToken cancellationToken)
    {
        using var response = await SendAsync(
            client,
            httpBase,
            "/twirp/livekit.RoomService/MutePublishedTrack",
            new
            {
                room = roomName,
                identity,
                trackSid,
                muted = true
            },
            roomName,
            cancellationToken);
    }

    private async Task<HttpResponseMessage?> SendAsync(
        HttpClient client,
        string httpBase,
        string path,
        object body,
        string roomName,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, httpBase + path);
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            CreateRoomAdminToken(roomName));
        request.Content = new StringContent(
            JsonSerializer.Serialize(body, JsonOptions),
            Encoding.UTF8,
            "application/json");

        var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var detail = await response.Content.ReadAsStringAsync(cancellationToken);
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound
                || detail.Contains("room does not exist", StringComparison.OrdinalIgnoreCase)
                || detail.Contains("requested room does not exist", StringComparison.OrdinalIgnoreCase))
            {
                response.Dispose();
                return null;
            }

            _logger.LogWarning(
                "LiveKit {Path} returned {Status} for room {Room}: {Detail}",
                path,
                (int)response.StatusCode,
                roomName,
                detail.Length > 240 ? detail[..240] : detail);
        }

        return response;
    }

    private string CreateRoomAdminToken(string roomName)
    {
        var videoGrant = new Dictionary<string, object>
        {
            ["roomAdmin"] = true,
            ["room"] = roomName
        };
        return LiveKitAccessToken.CreateAdmin(
            _options.ApiKey,
            _options.ApiSecret,
            videoGrant,
            TimeSpan.FromMinutes(5));
    }

    private static bool IsUserIdentity(string identity, string userPrefix) =>
        identity.Equals(userPrefix, StringComparison.OrdinalIgnoreCase)
        || identity.StartsWith(userPrefix + ".", StringComparison.OrdinalIgnoreCase);

    private static bool IsMicrophoneTrack(JsonElement track)
    {
        var source = ReadString(track, "source");
        if (source.Contains("SCREEN", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (source.Equals("MICROPHONE", StringComparison.OrdinalIgnoreCase) || source == "2")
        {
            return true;
        }

        var type = ReadString(track, "type");
        return type.Equals("AUDIO", StringComparison.OrdinalIgnoreCase) || type == "1";
    }

    private static string ReadString(JsonElement element, string name)
    {
        if (!element.TryGetProperty(name, out var value))
        {
            return string.Empty;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? string.Empty,
            JsonValueKind.Number => value.GetRawText(),
            _ => string.Empty
        };
    }

    private static string? ToHttpBase(string? wsUrl)
    {
        if (string.IsNullOrWhiteSpace(wsUrl))
        {
            return null;
        }

        var url = wsUrl.Trim().TrimEnd('/');
        if (url.StartsWith("wss://", StringComparison.OrdinalIgnoreCase))
        {
            return "https://" + url[6..];
        }

        if (url.StartsWith("ws://", StringComparison.OrdinalIgnoreCase))
        {
            return "http://" + url[5..];
        }

        if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            || url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
        {
            return url;
        }

        return null;
    }

    private sealed record RoomParticipant(string Identity, IReadOnlyList<string> MicrophoneTrackSids);
}
