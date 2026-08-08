# EO-004 — Reconnect UX

**Status:** INTERIM — code path for vote verification; browser reconnect **NOT EXECUTED**.  
**Date:** 2026-08-08

## Verdict matrix

| Check | Status | Evidence |
|-------|--------|----------|
| Unknown network during vote → verifying | **PASS** (code) | Verifying path implemented |
| Full disconnect → reconnect mid-LIVE | **NOT EXECUTED** | No forced disconnect test this pass |
| Reconnect mid-vote ballot integrity | **NOT EXECUTED** | — |
| Connection-lost overlay a11y | **NOT EXECUTED** this pass | AS-IS flagged inert/aria issue; not re-proven fixed |
| LiveKit reconnect | **BLOCKED** | LiveKit unset |

## Score (honest band)

Reconnect UX ~**48 / 100**. **MANUAL ACCEPTANCE REQUIRED** for certification.
