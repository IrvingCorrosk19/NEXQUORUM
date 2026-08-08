# EO-005 — Eligibility (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08

## Server gates (`CastVoteAsync`)

| Check | Code | Result |
|-------|------|--------|
| Auth + tenant | (auth middleware / TenantGuard) | Required |
| Assembly completed/cancelled | `ASSEMBLY_CLOSED` | **PASS** (coded) |
| Session missing | `SESSION_NOT_FOUND` | **PASS** |
| Session not Open | `VOTING_CLOSED` | **PASS** |
| Not assembly participant | `NOT_PARTICIPANT` | **PASS** |
| Attendance Registered/Left | `NOT_ACCREDITED` | **PASS** |
| Bad choice enum | `INVALID_CHOICE` | **PASS** |
| Already voted (diff choice) | `ALREADY_VOTED` | **PASS** (integration) |
| Invalid unit for property | `INVALID_UNIT` | **PASS** (coded) |
| ClientRequestId bound to other user | `NOT_ELIGIBLE` | **PASS** (coded) |

Open/complete related: `ASSEMBLY_NOT_ACTIVE`, `MOTION_INVALID`, `OPEN_VOTING_EXISTS`, `VOTING_NOT_OPEN`.

## API surface

- ProblemDetails `extensions.code` when `DomainException.Code` set (`ExceptionHandlingMiddleware`).
- `GET …/voting/{id}/my-status` → `MyVoteStatusDto.Status` (`ELIGIBLE` \| `ALREADY_VOTED` \| …).

## Tests

| Test | Status |
|------|--------|
| Double vote / idempotent / my-status | **PASS** (`Cast_vote_persists_and_double_vote_fails`) |
| Complete while open | **PASS** (`Complete_assembly_blocked_while_voting_open`) |
| Exhaustive matrix per code | **NOT EXECUTED** |

## Verdict

Semantic eligibility codes: **PASS** (harden). Full eligibility certification matrix: **NOT EXECUTED**.