# Voting Result Visibility Policy

Wire values on `VotingSession.ResultVisibilityPolicy`:

| Policy | During open — Owners | During open — President/operators | SignalR broadcast |
|--------|----------------------|-----------------------------------|-------------------|
| `HiddenUntilClose` (default) | Participation only | Participation only | Participation pulse (`TrendHidden=true`) |
| `PresidentOnlyLive` | Participation only | Live trend via authorized GET `/results` | Participation pulse only |
| `LiveResults` | Live trend | Live trend | Full tally |

Legacy `HidePartialResults`:

- `true` → `HiddenUntilClose` (unless policy override)
- `false` → `LiveResults`

## No information leak

Owners calling GET `/results` under hidden policies receive coefficients zeroed and `trendHidden: true`. Authorization is enforced in `VotingService`, not CSS.
