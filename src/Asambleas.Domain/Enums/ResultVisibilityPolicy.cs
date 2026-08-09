namespace Asambleas.Domain.Enums;

/// <summary>
/// Controls who may see vote trend (distribution) while a session is open.
/// Participation counts may still be shared without revealing choices.
/// </summary>
public enum ResultVisibilityPolicy
{
    /// <summary>No live trend for anyone until close (formal default).</summary>
    HiddenUntilClose = 0,

    /// <summary>Operators with open/close rights may see live trend; owners cannot.</summary>
    PresidentOnlyLive = 1,

    /// <summary>Anyone authorized for vote:results may see live trend.</summary>
    LiveResults = 2
}
