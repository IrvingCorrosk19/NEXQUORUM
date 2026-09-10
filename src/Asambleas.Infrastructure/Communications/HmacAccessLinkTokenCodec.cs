namespace Asambleas.Infrastructure.Communications;

using System.Security.Cryptography;
using System.Text;
using Asambleas.Application.Abstractions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

/// <summary>
/// HMAC-bound tokens: base64url(linkId || mac16). Same link id always yields the same raw token
/// so resend/reminders can rebuild the URL without storing the secret in the database.
/// </summary>
public sealed class HmacAccessLinkTokenCodec : IAccessLinkTokenCodec
{
    private readonly byte[] _key;

    public HmacAccessLinkTokenCodec(IConfiguration configuration, IHostEnvironment environment)
    {
        var material = configuration["AccessLinks:HmacKey"];
        if (string.IsNullOrWhiteSpace(material))
        {
            material = configuration["ConnectionStrings:DefaultConnection"];
        }

        if (string.IsNullOrWhiteSpace(material))
        {
            material = $"asambleas-access-links:{environment.EnvironmentName}:v1";
        }

        _key = SHA256.HashData(Encoding.UTF8.GetBytes(material.Trim()));
    }

    public string CreateToken(Guid linkId)
    {
        var idBytes = linkId.ToByteArray();
        using var hmac = new HMACSHA256(_key);
        var mac = hmac.ComputeHash(idBytes);
        var payload = new byte[32];
        Buffer.BlockCopy(idBytes, 0, payload, 0, 16);
        Buffer.BlockCopy(mac, 0, payload, 16, 16);
        return Base64UrlEncode(payload);
    }

    public bool TryGetLinkId(string rawToken, out Guid linkId)
    {
        linkId = Guid.Empty;
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return false;
        }

        byte[] payload;
        try
        {
            payload = Base64UrlDecode(rawToken.Trim());
        }
        catch
        {
            return false;
        }

        if (payload.Length != 32)
        {
            return false;
        }

        var idBytes = payload.AsSpan(0, 16).ToArray();
        var presentedMac = payload.AsSpan(16, 16);
        using var hmac = new HMACSHA256(_key);
        var expected = hmac.ComputeHash(idBytes);
        if (!CryptographicOperations.FixedTimeEquals(presentedMac, expected.AsSpan(0, 16)))
        {
            return false;
        }

        linkId = new Guid(idBytes);
        return true;
    }

    private static string Base64UrlEncode(byte[] data) =>
        Convert.ToBase64String(data)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static byte[] Base64UrlDecode(string input)
    {
        var s = input.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2:
                s += "==";
                break;
            case 3:
                s += "=";
                break;
        }

        return Convert.FromBase64String(s);
    }
}
