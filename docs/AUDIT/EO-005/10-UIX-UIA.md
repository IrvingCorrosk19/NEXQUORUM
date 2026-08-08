# EO-005 — UIX / UIA (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08

## Implemented (code)

| Behavior | Evidence | Status |
|----------|----------|--------|
| Select ≠ cast | Confirm dialog before POST | **PASS** (code) |
| `clientRequestId` on cast | `voting.js` `crypto.randomUUID` | **PASS** |
| Failure → verify via `my-status` | `onVerify` / `getMyVoteStatus` | **PASS** (code) |
| Receipt with EvidenceId | `renderReceipt` | **PASS** (code) |
| Official result: votes + coefficient + rule disclaimer | `renderOfficialResult` | **PASS** (code) |
| Operator progress without choice (secret) | `renderOperatorTally` | **PASS** (code) |

## Browser / human this pass

Full voting UI demo: **limited / MANUAL**. Not a certified UX walkthrough.

## Carry-over from EO-004

LIVE room chrome / overflow were EO-004; not re-certified here.

## Verdict

UI wiring for EO-005 integrity UX: **PASS** (code). Visual/human certification: **MANUAL ACCEPTANCE REQUIRED**.