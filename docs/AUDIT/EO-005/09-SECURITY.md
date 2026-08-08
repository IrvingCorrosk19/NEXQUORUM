# EO-005 — Security (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08

## In scope this harden

| Control | Status |
|---------|--------|
| Auth required for cast | **PASS** (pipeline) |
| Tenant match on assembly/session/participant | **PASS** (coded) |
| Semantic codes (no silent 500 on duplicate) | **PASS** |
| Idempotency binding (ClientRequestId ≠ other user) | **PASS** (coded) |
| Complete blocked while voting open | **PASS** |

## Prior / platform (not re-run as EO-005 suite)

| Control | Status |
|---------|--------|
| Cookie antiforgery (`CookieAntiforgeryFilter` + `api.js`) | **PARTIAL** — rely on existing EO; dedicated CSRF re-test **MANUAL** / **NOT EXECUTED** |
| XSS of voting UI | **MANUAL** / **NOT EXECUTED** this pass (`escapeHtml` used in voting.js) |
| Cross-tenant / manipulated id | Prior `SecurityTests` exist — **NOT** re-cited as EO-005 PASS |

## Blocked unrelated

LiveKit A/V — **BLOCKED** (not a vote integrity gate).

## Verdict

Integrity-focused security harden: **PASS** (code + voting integration). XSS/CSRF dedicated re-test: **MANUAL** / partial. Full security certification: **FAIL** (incomplete evidence).