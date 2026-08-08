# EO-005 — Vote Integrity (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08  
**ADR:** ADR-006 (updated behavior this harden pass)

## Exactly-once effect

| Mechanism | Status |
|-----------|--------|
| App check existing `(VotingSessionId, UserId)` | **PASS** |
| Unique DB index `(VotingSessionId, UserId)` | **PASS** (pre-existing) |
| `ClientRequestId` + filtered unique index | **PASS** — migration `EO005_VotingIntegrity` |
| Same choice / same key → `IdempotentReplay: true` | **PASS** (integration) |
| Different choice after vote → `ALREADY_VOTED` | **PASS** (integration) |
| Concurrent unique race → semantic / idempotent | **PASS** — `DbUpdateException` handler + `Concurrent_casts_produce_single_vote` |

## Evidence receipt

`EvidenceId` returned on cast; my-status returns same id when `ALREADY_VOTED`.

## Audit

`VOTE_CAST` metadata omits `Choice` (intentional for secret) — see `08-SECRET-VOTING.md`.

## Not proven this pass

- Cross-tenant cast isolation re-run dedicated to EO-005 (**rely on prior SecurityTests** — mark partial).
- 8 concurrent distinct users.

## Verdict

Hardened integrity path for single-voter races/idempotency: **PASS**. Certification (multi-user E2E): **NOT EXECUTED**.