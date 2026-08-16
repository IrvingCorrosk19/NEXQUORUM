namespace Asambleas.Infrastructure.Meeting;

using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Asambleas.Application.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

/// <summary>
/// LiveKit Room Composite Egress when configured; otherwise certified local MP4 fallback
/// (explicit provider name, never presented as LiveKit capture).
/// </summary>
public sealed class LiveKitMeetingRecordingProvider : IMeetingRecordingProvider
{
    private readonly LiveKitOptions _liveKit;
    private readonly IAssemblyRecordingStorage _storage;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<LiveKitMeetingRecordingProvider> _logger;
    private readonly bool _allowSyntheticFallback;
    private readonly string? _egressHttpBase;
    private readonly string _fileOutputRoot;

    public LiveKitMeetingRecordingProvider(
        IOptions<LiveKitOptions> liveKit,
        IAssemblyRecordingStorage storage,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<LiveKitMeetingRecordingProvider> logger)
    {
        _liveKit = liveKit.Value;
        _storage = storage;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _allowSyntheticFallback = string.Equals(
            configuration["Recording:AllowSyntheticFallback"]
            ?? Environment.GetEnvironmentVariable("ASAMBLEAS_RECORDING_SYNTHETIC"),
            "true",
            StringComparison.OrdinalIgnoreCase);
        // Only call LiveKit Egress when an egress endpoint is explicitly configured.
        // Falling back to the LiveKit signaling URL causes a long 503 timeout when no
        // livekit-egress worker is running ("no response from servers").
        _egressHttpBase = FirstNonEmpty(
            Environment.GetEnvironmentVariable("LIVEKIT_EGRESS_URL"),
            configuration["LiveKit:EgressUrl"]);
        _fileOutputRoot = configuration["Recording:EgressOutputRoot"]
                          ?? Environment.GetEnvironmentVariable("ASAMBLEAS_EGRESS_OUTPUT")
                          ?? "/out";
    }

    public Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        if (_liveKit.IsConfigured && !string.IsNullOrWhiteSpace(_egressHttpBase))
        {
            return Task.FromResult(true);
        }

        return Task.FromResult(_allowSyntheticFallback);
    }

    public async Task<MeetingRecordingStartResult> StartAsync(
        Guid tenantId,
        Guid assemblyId,
        Guid recordingId,
        string roomName,
        string outputStorageKey,
        CancellationToken cancellationToken = default)
    {
        var display = SanitizeFileName($"Asamblea-{assemblyId:N}-{recordingId:N}.mp4");
        if (_liveKit.IsConfigured && !string.IsNullOrWhiteSpace(_egressHttpBase))
        {
            try
            {
                var egressId = await StartRoomCompositeAsync(roomName, outputStorageKey, cancellationToken);
                return new MeetingRecordingStartResult(
                    "LiveKitEgress",
                    egressId,
                    outputStorageKey,
                    "video/mp4",
                    display);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "LiveKit egress start failed for assembly {AssemblyId}", assemblyId);
                if (!_allowSyntheticFallback)
                {
                    throw;
                }
            }
        }

        if (!_allowSyntheticFallback)
        {
            throw new InvalidOperationException("Recording provider is not configured.");
        }

        // Certified pilot fallback: write a tiny valid MP4 so auth/stream/download paths are real.
        await using (var ms = new MemoryStream(MinimalMp4.Bytes))
        {
            await _storage.WriteAsync(outputStorageKey, ms, "video/mp4", cancellationToken);
        }

        return new MeetingRecordingStartResult(
            "SyntheticPilotMp4",
            null,
            outputStorageKey,
            "video/mp4",
            display);
    }

    public async Task<MeetingRecordingStopResult> StopAsync(
        string? egressId,
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(egressId) && _liveKit.IsConfigured && !string.IsNullOrWhiteSpace(_egressHttpBase))
        {
            await StopEgressAsync(egressId, cancellationToken);
            return new MeetingRecordingStopResult(egressId, ProcessingAsync: true);
        }

        // Synthetic already written at start.
        _ = storageKey;
        return new MeetingRecordingStopResult(null, ProcessingAsync: false);
    }

    public async Task<MeetingRecordingProviderStatus> GetStatusAsync(
        string? egressId,
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(egressId) && _liveKit.IsConfigured)
        {
            try
            {
                var info = await GetEgressInfoAsync(egressId, storageKey, cancellationToken);
                return info;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to poll egress {EgressId}", egressId);
            }
        }

        if (!string.IsNullOrWhiteSpace(storageKey)
            && await _storage.ExistsAsync(storageKey, cancellationToken))
        {
            await using var stream = await _storage.OpenReadAsync(storageKey, cancellationToken);
            long? size = stream.CanSeek ? stream.Length : null;
            if (size is null or > 0)
            {
                return new MeetingRecordingProviderStatus("Ready", null, size, null);
            }
        }

        return new MeetingRecordingProviderStatus("Processing", null, null, null);
    }

    private async Task<string> StartRoomCompositeAsync(
        string roomName,
        string storageKey,
        CancellationToken cancellationToken)
    {
        var filepath = $"{_fileOutputRoot.TrimEnd('/')}/{storageKey}";
        var body = new
        {
            room_name = roomName,
            layout = "grid",
            audio_only = false,
            file_outputs = new[]
            {
                new
                {
                    filepath,
                    disable_manifest = true
                }
            }
        };

        using var req = CreateEgressRequest(HttpMethod.Post, "/twirp/livekit.Egress/StartRoomCompositeEgress");
        req.Content = JsonContent.Create(body);
        var client = _httpClientFactory.CreateClient("livekit-egress");
        using var res = await client.SendAsync(req, cancellationToken);
        var json = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Egress start failed: {(int)res.StatusCode} {json}");
        }

        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("egress_id", out var id))
        {
            return id.GetString() ?? throw new InvalidOperationException("Missing egress_id.");
        }

        if (doc.RootElement.TryGetProperty("egressId", out var id2))
        {
            return id2.GetString() ?? throw new InvalidOperationException("Missing egressId.");
        }

        throw new InvalidOperationException("Egress response missing id.");
    }

    private async Task StopEgressAsync(string egressId, CancellationToken cancellationToken)
    {
        using var req = CreateEgressRequest(HttpMethod.Post, "/twirp/livekit.Egress/StopEgress");
        req.Content = JsonContent.Create(new { egress_id = egressId });
        var client = _httpClientFactory.CreateClient("livekit-egress");
        using var res = await client.SendAsync(req, cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            var body = await res.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogWarning("StopEgress {Status}: {Body}", (int)res.StatusCode, body);
        }
    }

    private async Task<MeetingRecordingProviderStatus> GetEgressInfoAsync(
        string egressId,
        string storageKey,
        CancellationToken cancellationToken)
    {
        using var req = CreateEgressRequest(HttpMethod.Post, "/twirp/livekit.Egress/ListEgress");
        req.Content = JsonContent.Create(new { egress_id = egressId });
        var client = _httpClientFactory.CreateClient("livekit-egress");
        using var res = await client.SendAsync(req, cancellationToken);
        var json = await res.Content.ReadAsStringAsync(cancellationToken);
        if (!res.IsSuccessStatusCode)
        {
            return new MeetingRecordingProviderStatus("Processing", null, null, json);
        }

        using var doc = JsonDocument.Parse(json);
        var items = doc.RootElement.TryGetProperty("items", out var arr) ? arr : default;
        if (items.ValueKind != JsonValueKind.Array || items.GetArrayLength() == 0)
        {
            return new MeetingRecordingProviderStatus("Processing", null, null, null);
        }

        var item = items[0];
        var status = item.TryGetProperty("status", out var st)
            ? st.ToString()
            : "PROCESSING";
        // LiveKit status enums often EGRESS_COMPLETE / EGRESS_ACTIVE / EGRESS_FAILED
        if (status.Contains("COMPLETE", StringComparison.OrdinalIgnoreCase)
            || status.Contains("Ready", StringComparison.OrdinalIgnoreCase)
            || status == "3")
        {
            // READY means the file is actually on shared storage — not merely egress COMPLETE.
            if (!string.IsNullOrWhiteSpace(storageKey)
                && await _storage.ExistsAsync(storageKey, cancellationToken))
            {
                await using var stream = await _storage.OpenReadAsync(storageKey, cancellationToken);
                long? size = stream.CanSeek ? stream.Length : null;
                if (size is null or > 0)
                {
                    return new MeetingRecordingProviderStatus("Ready", null, size, null);
                }
            }

            return new MeetingRecordingProviderStatus("Processing", null, null, null);
        }

        if (status.Contains("FAIL", StringComparison.OrdinalIgnoreCase)
            || status.Contains("ABORTED", StringComparison.OrdinalIgnoreCase))
        {
            var err = item.TryGetProperty("error", out var e) ? e.GetString() : "Egress failed";
            return new MeetingRecordingProviderStatus("Failed", null, null, err);
        }

        if (status.Contains("ACTIVE", StringComparison.OrdinalIgnoreCase)
            || status.Contains("STARTING", StringComparison.OrdinalIgnoreCase)
            || status == "1" || status == "2")
        {
            return new MeetingRecordingProviderStatus("Recording", null, null, null);
        }

        return new MeetingRecordingProviderStatus("Processing", null, null, null);
    }

    private HttpRequestMessage CreateEgressRequest(HttpMethod method, string path)
    {
        var token = CreateEgressToken();
        var req = new HttpRequestMessage(method, Combine(_egressHttpBase!, path));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return req;
    }

    private string CreateEgressToken()
    {
        // roomRecord grant for egress control
        var videoGrant = new Dictionary<string, object>
        {
            ["roomRecord"] = true
        };
        return LiveKitAccessToken.CreateAdmin(
            _liveKit.ApiKey,
            _liveKit.ApiSecret,
            videoGrant,
            TimeSpan.FromMinutes(10));
    }

    private static string SanitizeFileName(string name)
    {
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(c, '-');
        }

        return name;
    }

    private static string? NormalizeHttpBase(string? wsUrl)
    {
        if (string.IsNullOrWhiteSpace(wsUrl))
        {
            return null;
        }

        var u = wsUrl.Trim();
        if (u.StartsWith("wss://", StringComparison.OrdinalIgnoreCase))
        {
            return "https://" + u[6..].TrimEnd('/');
        }

        if (u.StartsWith("ws://", StringComparison.OrdinalIgnoreCase))
        {
            return "http://" + u[5..].TrimEnd('/');
        }

        return u.TrimEnd('/');
    }

    private static string Combine(string baseUrl, string path) =>
        $"{baseUrl.TrimEnd('/')}/{path.TrimStart('/')}";

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
}

/// <summary>Minimal ftyp+mdat MP4 for pilot auth/download certification (not a LiveKit capture).</summary>
internal static class MinimalMp4
{
    public static byte[] Bytes { get; } = Build();

    private static byte[] Build()
    {
        var ftyp = new byte[]
        {
            0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
            0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x00, 0x01,
            0x69, 0x73, 0x6F, 0x6D, 0x61, 0x76, 0x63, 0x31
        };
        var free = new byte[] { 0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65 };
        var payload = System.Text.Encoding.ASCII.GetBytes("ASAMBLEAS-PILOT-RECORDING");
        var mdatSize = 8 + payload.Length;
        var mdatHeader = new byte[]
        {
            (byte)((mdatSize >> 24) & 0xff),
            (byte)((mdatSize >> 16) & 0xff),
            (byte)((mdatSize >> 8) & 0xff),
            (byte)(mdatSize & 0xff),
            (byte)'m', (byte)'d', (byte)'a', (byte)'t'
        };

        var result = new byte[ftyp.Length + free.Length + mdatHeader.Length + payload.Length];
        Buffer.BlockCopy(ftyp, 0, result, 0, ftyp.Length);
        Buffer.BlockCopy(free, 0, result, ftyp.Length, free.Length);
        Buffer.BlockCopy(mdatHeader, 0, result, ftyp.Length + free.Length, mdatHeader.Length);
        Buffer.BlockCopy(payload, 0, result, ftyp.Length + free.Length + mdatHeader.Length, payload.Length);
        return result;
    }
}
