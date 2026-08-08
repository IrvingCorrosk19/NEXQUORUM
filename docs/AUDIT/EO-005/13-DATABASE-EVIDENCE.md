# EO-005 — Database Evidence (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08

## Migration

`20260808121759_EO005_VotingIntegrity` — **PASS** (created).

| Change | Table |
|--------|-------|
| `AppliedDecisionRule` varchar(64) | `voting_sessions` |
| `DecisionStatus` varchar(32) | `voting_sessions` |
| `ClientRequestId` varchar(128) | `votes` |
| Unique filtered index `IX_votes_VotingSessionId_ClientRequestId` | `votes` (`ClientRequestId IS NOT NULL`) |

## Pre-existing constraints (still authority)

- Unique `(VotingSessionId, UserId)` on votes.
- `CoefficientPercent` precision 7,4.

## Runtime proof

Integration tests assert single vote row after double/concurrent cast — **PASS**.

Live DBA dump / production apply verification: **NOT EXECUTED** (dev migration present).

## Verdict

Schema harden evidence: **PASS**. Ops apply + load evidence: **NOT EXECUTED**.