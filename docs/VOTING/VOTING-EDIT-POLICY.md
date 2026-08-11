# Voting Edit Policy

| State | Critical edit |
|-------|----------------|
| Draft / Presented | Full |
| Open + 0 ballots | Must **withdraw** first (`POST .../withdraw`) |
| Open + ≥1 ballot | Hard lock — **cancel + version** |
| Closed / Cancelled / Approved / Rejected | Immutable |

Server rejects PUT with codes `VOTING_LOCKED`, `VOTING_OPEN_ZERO`, `VOTING_IMMUTABLE`, `CONCURRENCY_CONFLICT`.
