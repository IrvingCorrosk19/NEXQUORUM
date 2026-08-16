namespace Asambleas.Infrastructure.Meeting;

using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.IdentityModel.Tokens;

/// <summary>
/// Mints LiveKit access tokens (video grant) with HMAC-SHA256. Secrets never hardcoded.
/// </summary>
internal static class LiveKitAccessToken
{
    public static string Create(
        string apiKey,
        string apiSecret,
        string identity,
        string name,
        string roomName,
        bool canPublish,
        bool canSubscribe,
        bool canPublishScreenShare,
        TimeSpan ttl,
        out DateTimeOffset expiresAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(roomName);
        // LiveKit source allowlist: owners may publish camera/mic; screen share only when authorized.
        var sources = new List<string> { "camera", "microphone" };
        if (canPublishScreenShare)
        {
            sources.Add("screen_share");
            sources.Add("screen_share_audio");
        }

        var videoGrant = new Dictionary<string, object>
        {
            ["roomJoin"] = true,
            ["room"] = roomName,
            ["canPublish"] = canPublish,
            ["canSubscribe"] = canSubscribe,
            ["canPublishData"] = canPublish,
            ["canPublishSources"] = sources
        };

        return Write(apiKey, apiSecret, identity, name, videoGrant, ttl, out expiresAtUtc);
    }

    public static string CreateAdmin(
        string apiKey,
        string apiSecret,
        IReadOnlyDictionary<string, object> videoGrant,
        TimeSpan ttl) =>
        Write(apiKey, apiSecret, "asambleas-egress", "ASAMBLEAS Egress", videoGrant, ttl, out _);

    private static string Write(
        string apiKey,
        string apiSecret,
        string identity,
        string name,
        IReadOnlyDictionary<string, object> videoGrant,
        TimeSpan ttl,
        out DateTimeOffset expiresAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(apiKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(apiSecret);
        ArgumentException.ThrowIfNullOrWhiteSpace(identity);

        var now = DateTimeOffset.UtcNow;
        expiresAtUtc = now.Add(ttl);

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(apiSecret)),
            SecurityAlgorithms.HmacSha256);

        var header = new JwtHeader(credentials);
        var payload = new JwtPayload
        {
            { JwtRegisteredClaimNames.Iss, apiKey },
            { JwtRegisteredClaimNames.Sub, identity },
            { JwtRegisteredClaimNames.Nbf, now.ToUnixTimeSeconds() },
            { JwtRegisteredClaimNames.Exp, expiresAtUtc.ToUnixTimeSeconds() },
            { JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N") },
            { "name", name },
            { "video", videoGrant }
        };

        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(header, payload));
    }
}
