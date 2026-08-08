# EO-005 — Secret Voting (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08

## Defaults

`HidePartialResults = true` on open (API request; UI can pass true).

## Ballot secrecy behaviors

| Behavior | Status |
|----------|--------|
| Audit `VOTE_CAST` omits `Choice` | **PASS** (code comment + metadata shape) |
| Cast receipt: EvidenceId, no choice echo in `CastVoteResponse` | **PASS** |
| Secret open: SignalR progress may send `VotesCast` with zeroed coefficients, no choice | **PASS** (coded) |
| Non-secret: publish full tally | **PASS** (coded) |
| Results while open + secret: partials withheld | **PASS** (coded paths in `VotingService`) |

## Not proven

- Dedicated audit-log assertion test for “choice absent” this pass: **NOT EXECUTED** (rely on code review).
- Operator cannot infer choice via side channels beyond aggregate progress: **MANUAL**.

## Verdict

Design intent for secret partials: **PASS** (code). Forensic E2E of audit payload: **NOT EXECUTED**.