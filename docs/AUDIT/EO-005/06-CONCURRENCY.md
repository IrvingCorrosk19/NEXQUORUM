# EO-005 — Concurrency (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08

## Cast race

Two parallel casts same user/session:

1. Both pass app-level “no vote yet”.
2. One `SaveChanges` wins unique `(VotingSessionId, UserId)` (and/or `ClientRequestId`).
3. Loser: `DbUpdateException` → reload winner → same choice → idempotent receipt; different choice → `VOTE_CHOICE_CONFLICT` / already-voted semantics.

**Evidence:** `VotingService.CastVoteAsync` catch; integration `Concurrent_casts_produce_single_vote` → voteCount == 1 — **PASS**.

## Close race

If session already Closed, `CloseSessionAsync` returns existing tally/decision — coded. Dedicated concurrent-close test: **NOT EXECUTED**.

## Complete vs open voting

`AssemblyService` blocks `Completed` while any Open session — `OPEN_VOTING_EXISTS` — **PASS** (`Complete_assembly_blocked_while_voting_open`).

## Scale

100 simulated concurrent votes: **NOT EXECUTED**.

## Verdict

Documented cast concurrency harden: **PASS** (2-client same user). Multi-user / load: **NOT EXECUTED**.