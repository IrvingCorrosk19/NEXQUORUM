namespace Asambleas.Infrastructure.Meeting;

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
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
        TimeSpan ttl,
        out DateTimeOffset expiresAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(apiKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(apiSecret);
        ArgumentException.ThrowIfNullOrWhiteSpace(identity);
        ArgumentException.ThrowIfNullOrWhiteSpace(roomName);

        var now = DateTimeOffset.UtcNow;
        expiresAtUtc = now.Add(ttl);

        var videoGrant = new Dictionary<string, object>
        {
            ["roomJoin"] = true,
            ["room"] = roomName,
            ["canPublish"] = canPublish,
            ["canSubscribe"] = canSubscribe,
            ["canPublishData"] = canPublish
        };

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
