# Secret Voting Model

Classification for current ASAMBLEAS formal voting:

**Level: SECRET (operational) / PSEUDONYMOUS (forensic DB)**

| Layer | Behavior |
|-------|----------|
| UI receipt | Shows `VT-XXXXXX` from evidence GUID — **no choice** |
| Audit `VOTE_CAST` | Omits choice |
| SignalR under hidden policies | Participation only |
| Database `votes.Choice` | Stored for recount / evidence authority |

This is **not** Strong Secret (no cryptographic anonymity / mix-net). Operators with DB access can correlate user→choice. Public voting (`LiveResults`) reveals aggregates live, not necessarily individual ballots in UI.

Individual Owner→Selection is not exposed on owner UI or public SignalR when policy hides trend.
