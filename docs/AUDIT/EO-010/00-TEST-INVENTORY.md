# EO-010 — Test Inventory (controllers / pages)

**Date:** 2026-08-09  
**Rule:** Inventory only. Full adversarial certification is PARTIAL via existing suites — not a complete EO-010 execution.

---

## Pages (`wwwroot`)

| Page | Path | Primary roles | Notes |
|------|------|---------------|-------|
| Login / home | `/index.html` | all | Auth entry |
| Dashboard | `/dashboard.html` | operator / owner | Assembly list / readiness |
| Check-in | `/checkin.html` | operator | Accreditation |
| Lobby | `/lobby.html` | accredited participants | Devices + join gate |
| Assembly room | `/assembly.html` | president / secretary / operator / owner | LIVE governance + media |
| Projector | `/projector.html` | display | Quorum / agenda projection |
| Minutes | `/minutes.html` | authorized | Fact minutes (print CSS) |
| Evidence | `/evidence.html` | audit:view | Evidence package |

---

## API controllers

| Controller | Route prefix | Endpoints |
|------------|--------------|-----------|
| `AuthController` | `/api/auth` | `POST login`, `POST logout`, `GET me`, `GET antiforgery` |
| `DemoController` | `/api/demo` | `GET users` |
| `AssembliesController` | `/api/assemblies` | list, get, dashboard, room-state, readiness, minutes (+legacy), evidence (+legacy), start-checkin, start, pause, resume, complete |
| `AttendanceController` | `/api/assemblies/{id}/attendance` | participants, preview, check-in, accredit |
| `QuorumController` | `/api/assemblies/{id}/quorum` | latest, snapshots |
| `AgendaController` | `/api/assemblies/{id}/agenda` | GET, POST active |
| `MotionsController` | `/api/assemblies/{id}/motions` | list, active, get, present |
| `SpeakersController` | `/api/assemblies/{id}/speakers` | request, grant, complete, reject, skip, queue |
| `VotingController` | `/api/assemblies/{id}/voting` | open, cast, close, results, my-receipt, my-status, open GET |
| `MeetingController` | `/api/assemblies/{id}/meeting` | `POST join-token`, `GET room` |
| `AuditController` | `/api/assemblies/{id}/audit` | GET |

---

## Automated suites covering adversarial / integrity (partial EO-010)

| Suite | Coverage | Status this run |
|-------|----------|-----------------|
| Unit | lifecycle, quorum, majority, room rules, meeting publish/TTL | 45 PASS |
| Architecture | layer deps | 3 PASS |
| Security | authz, manipulated IDs, cross-tenant, meeting token publish | 8+ PASS |
| Integration | attendance/representation, quorum, voting txn, room orchestration, evidence/minutes, tenant, audit, room-state | 17 PASS |
| E2E | assembly meeting in-process | 2 PASS, 1 SKIP (LiveKit) |

---

## Explicitly NOT in inventory execution

- Full route crawl with adversarial payloads for every verb
- Full UI button/dialog matrix
- 8-browser Playwright
- 300-participant synthetic load
- LiveKit human A/V
- Minutes versioning / server PDF (product gaps — see defect register)
