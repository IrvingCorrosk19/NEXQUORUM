# ADR-006 — Voting Integrity

**Status:** Accepted  
**Date:** 2026-08-08  
**EO:** EO-001

## Context

Double voting or unauthorized casting would destroy trust in the governance platform.

## Decision

`CastVote` is a transactional pipeline:

1. Authenticated user + tenant context  
2. Assembly + participant eligibility  
3. VotingSession must be OPEN  
4. Application check for existing vote  
5. Persist vote  
6. Unique DB constraint `(VotingSessionId, UserId)`  
7. Audit `VOTE_CAST` **without** storing choice in general logs when secret  
8. Confirm to client; SignalR broadcasts aggregate counts only (when configured)

Decision calculation uses `IDecisionRule` (demo: `SimpleMajorityDecisionRule`).

## Consequences

- Frontend disable is UX only — never the integrity boundary.
- Concurrency conflicts surface as controlled domain errors.
