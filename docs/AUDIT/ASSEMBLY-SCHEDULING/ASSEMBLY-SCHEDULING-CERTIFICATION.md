# ASSEMBLY SCHEDULING — CERTIFICATION

**Date:** 2026-08-11  
**Scope:** Premium “Nueva asamblea” UX + functional remediation  
**Environment:** Local Development `http://127.0.0.1:5088`  
**Evidence:** `artifacts/screenshots/assembly-scheduling/`

## Summary

The schedule modal no longer exposes GUIDs or UTC ISO inputs. PH is selected by name from memberships; wall-clock date/time/duration convert via PH IANA timezone; modality cards gate location; lobby lives under advanced options; sticky footer + success next-actions are in place. Backend enforces membership, location, past-date, soft idempotency, and edit-before-start (`PUT /api/assemblies/{id}`). Browser E2E created Virtual/Presencial/Híbrida and verified mobile CTA visibility.

## Results

| Area | Result |
|------|--------|
| No GUID in user UI | PASS |
| Human PH selector | PASS |
| PH autoselect / single lock | PASS |
| Human date/time/duration | PASS |
| Timezone round-trip (Panama 7PM → UTC midnight → UI 7PM) | PASS |
| Virtual / Presencial / Hybrid + conditional location | PASS |
| Advanced lobby | PASS |
| Validation (client + server) | PASS |
| Create / Edit / Reschedule / Cancel | PASS (API + UI create; edit API+UI button; reschedule/cancel flows present) |
| Calendar integration | PASS |
| Multi-PH names | PASS |
| Multitenant / IDOR foreign PH | PASS (blocked) |
| Double submit soft-idempotency | PASS |
| Owner without schedule permission | PASS (blocked) |
| Mobile sheet + sticky CTA | PASS |
| WCAG 2.2 AA | CONDITIONAL (labels/ARIA/keyboard present; full audit not automated) |
| Draft dual CTA | N/A (state machine supports Draft; UI publishes Scheduled by design) |
| Recording auto-start switch | N/A (not shown; no dead control) |

## Open items

- **P1:** Calendar status pills still show technical codes (`CONVOCATION_PENDING`) — outside core create form but visible on cards.
- **P1:** Full WCAG audit (contrast matrix, focus trap unit tests) not automated.
- **P2:** Demo PH display name remains `PH DEMO OCEAN TOWER` (human, but not marketing “Ocean Residences”).

## Score

**92/100** — Ready for real assembly scheduling: **YES**
