namespace Asambleas.Application.Abstractions;

/// <summary>
/// Reconstructible opaque tokens for convocation join links.
/// Raw tokens are never persisted; only SHA-256 hashes are stored.
/// </summary>
public interface IAccessLinkTokenCodec
{
    /// <summary>URL-safe token deterministically bound to <paramref name="linkId"/>.</summary>
    string CreateToken(Guid linkId);

    /// <summary>Validates MAC and extracts link id when the token uses the reconstructible format.</summary>
    bool TryGetLinkId(string rawToken, out Guid linkId);
}
