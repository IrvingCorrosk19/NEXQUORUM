# ASAMBLEAS — Calendar & Scheduling Certification

**Date:** 2026-08-09  
**VPS:** https://asambleas.164.68.99.83.nip.io/  
**Evidence:** `artifacts/vps/evidence-calendar/`  
**Harness:** `artifacts/vps/cert-calendar.mjs`  
**Migration:** `EO008_AssemblyCalendarScheduling`

## Results

| Check | Result |
|-------|--------|
| CALENDAR MONTH | PASS |
| CALENDAR WEEK | PASS |
| AGENDA VIEW | PASS |
| SCHEDULE | PASS (API create + UI form; president RBAC) |
| RESCHEDULE | PASS (auditable; not silent date edit) |
| RESCHEDULE HISTORY | PASS |
| IMPACT ANALYSIS | PASS |
| CANCELLATION | PASS (API + lifecycle; UI dialog present) |
| CONVOCATION INTEGRATION | PASS (Draft Vn+1 when prior sent; no mutate V1) |
| REMINDER INTEGRATION | PASS (pending cancelled + rebuild on reschedule) |
| COMMUNICATION CENTER | PASS (portal notifications offered; no blind external send) |
| NEXT ASSEMBLY | PASS |
| COUNTDOWN | PASS |
| JOIN WINDOW | PASS (lobby opens label / canJoin) |
| LIVE STATUS | PASS (calendarStatus LIVE + Entrar ahora when applicable) |
| LIVEKIT/PRE-JOIN INTEGRATION | PASS (Entrar → lobby.html) |
| ICS | PASS (no secrets/tokens) |
| GOOGLE/OUTLOOK ADD | PASS (deeplink URLs) |
| OWNER UX | PASS (dashboard next card; cannot reschedule) |
| PRESIDENT UX | PASS (calendar manage + reschedule) |
| MULTI-TENANT | PASS (cross-tenant event blocked) |
| RBAC | PASS (owner reschedule 403) |
| AUDIT | PASS (`ASSEMBLY_RESCHEDULED` / cancel / schedule events) |
| SECURITY | PASS (security tests + IDOR/tenant checks) |
| MOBILE | PASS (agenda-first CSS ≤768) |
| ACCESSIBILITY | PASS (keyboard drawer Escape, aria-pressed views) |
| BROWSER E2E | PASS |
| CORE REGRESSION | PASS (build + prior suites; calendar additive) |
| VPS | PASS |

## P0 OPEN

- None blocking certification of scheduling center core.

## P1 OPEN

- Reminder **dispatch worker** (occurrences exist; outbound fire still Communication Center workflow)
- Drag/drop reschedule (intentionally omitted; opens review flow only if added later)
- Full UI cancel E2E click-path (API cancel covered; dialog wired)
- Secretary-specific schedule prepare metrics beyond calendar view
- Automated 2-tenant calendar matrix browser run (API isolation covered)

## FINAL VERDICT

**CERTIFIED**
