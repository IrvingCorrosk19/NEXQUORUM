# MASTER REQUIREMENTS TRACEABILITY — ASAMBLEAS

**Date:** 2026-08-09  
**Commit baseline:** `fff3ffc` + local EO-009 media remediation (commit pending)  
**Rule:** Honest status only. No fake PASS. Granular rows (not one row per EO).

**Status legend:** `PASS` | `PARTIAL` | `FAIL` | `MISSING` | `BLOCKED` | `NOT TESTED` | `MANUAL ACCEPTANCE REQUIRED` | `NOT APPLICABLE`

---

## Traceability matrix

| Requirement ID | Source EO | Requirement | Implementation Location | Automated Test | Status |
|----------------|-----------|-------------|--------------------------|-----------------|--------|
| REQ-001-01 | EO-001 | Modular monolith boundaries (Domain/Application/Infrastructure/Web) | `src/Asambleas.*` projects | `LayerDependencyTests` | PASS |
| REQ-001-02 | EO-001 | Tenant-scoped assembly data model | Domain entities + EF configs | Integration tenant tests | PASS |
| REQ-001-03 | EO-001 | Cookie/session auth entry | `AuthController`, login page | Security AuthorizationTests | PASS |
| REQ-001-04 | EO-001 | Role/permission map for assembly roles | `RolePermissionMap`, policies | AuthorizationTests | PASS |
| REQ-001-05 | EO-001 | Demo seed for Ocean assembly | `DemoSeed` / Infrastructure seed | Used by integration fixtures | PASS |
| REQ-002-01 | EO-002 | Login → dashboard → check-in → lobby → room flow | `index/dashboard/checkin/lobby/assembly.html` + JS modules | E2E meeting path (partial) | PARTIAL |
| REQ-002-02 | EO-002 | Room hydrate `GET room-state` | `AssembliesController`, `AssemblyRoomService` | `AssemblyRoomStateTests` | PASS |
| REQ-002-03 | EO-002 | SignalR join requires participant + tenant | `signalr-client.js`, hub auth | Security / integration (partial) | PARTIAL |
| REQ-002-04 | EO-002 | Operator vs owner role-aware chrome | `room-app.js`, assembly CSS | Prior browser spot-check EO-004 | PARTIAL |
| REQ-002-05 | EO-002 | Reconnect UX + REST rehydrate | `room-app.js`, SignalR handlers | Unit/integration N/A; UI code | PARTIAL |
| REQ-002-06 | EO-002 | Projector / minutes / evidence pages exist | `projector/minutes/evidence.html` | EvidenceMinutesTests (API) | PARTIAL |
| REQ-002-07 | EO-002 | i18n es-PA + en baseline | `js/i18n/*` | None dedicated | PARTIAL |
| REQ-002-08 | EO-002 | LiveKit absence must not block governance readiness | Readiness / meeting room info | E2E SKIP LiveKit; readiness code | PARTIAL |
| REQ-003-01 | EO-003 | Design system / assembly UI consistency | `wwwroot/css/*`, assembly pages | Visual audit docs EO-003 | PARTIAL |
| REQ-003-02 | EO-003 | Responsive assembly surfaces | CSS + layout | Full matrix NOT EXECUTED | NOT TESTED |
| REQ-003-03 | EO-003 | Accessibility baseline (WCAG-oriented) | semantic markup / labels | Full a11y audit NOT EXECUTED | NOT TESTED |
| REQ-004-01 | EO-004 | LIVE operator controls (start/pause/resume/complete) | `AssembliesController` + room UI | Lifecycle unit + RoomOrchestration | PASS |
| REQ-004-02 | EO-004 | Overflow containment / live mode chrome | `assembly-room.css`, `data-mode` | Prior browser EO-004 | PARTIAL |
| REQ-004-03 | EO-004 | Voting select → confirm ceremony UI | `room-app.js` voting UI | Code; full E2E limited | PARTIAL |
| REQ-004-04 | EO-004 | End assembly blocked while voting open | Room rules / complete precheck | `AssemblyRoomRulesTests` / orchestration | PASS |
| REQ-004-05 | EO-004 | Secretary distinct LIVE UX | Shares operator viewer | Not separately tested | NOT TESTED |
| REQ-004-06 | EO-004 | 8-context Playwright LIVE | — | — | NOT TESTED |
| REQ-005-01 | EO-005 | Vote cast with client request idempotency | `VotingService`, unique index | `VotingTransactionTests` | PASS |
| REQ-005-02 | EO-005 | Already-voted / different-choice rejection | Voting domain codes | `VotingTransactionTests` | PASS |
| REQ-005-03 | EO-005 | Concurrent cast maps to semantic/idempotent | Voting + DbUpdate handling | `VotingTransactionTests` | PASS |
| REQ-005-04 | EO-005 | `GET my-status` / receipt | `VotingController` | Integration voting | PASS |
| REQ-005-05 | EO-005 | Complete blocked while voting open | Assembly complete rules | Unit room rules | PASS |
| REQ-005-06 | EO-005 | Close snapshots decision rule/status | Voting close + evidence | EvidenceMinutes / voting | PASS |
| REQ-005-07 | EO-005 | Secret voting omits choice from audit surface | Audit mapping / SignalR | Code review; dedicated XSS/CSRF re-test | PARTIAL |
| REQ-005-08 | EO-005 | Human 8-person voting drill | — | — | MANUAL ACCEPTANCE REQUIRED |
| REQ-006-01 | EO-006 | Powers / representation domain | `AssemblyRepresentation`, Power entities | AttendanceRepresentationTests | PASS |
| REQ-006-02 | EO-006 | Unique active (AssemblyId, UnitId) | DB constraint + service | AttendanceRepresentationTests | PASS |
| REQ-006-03 | EO-006 | Operator accredit + check-in target user | `AttendanceController` / service | AttendanceRepresentationTests | PASS |
| REQ-006-04 | EO-006 | Concurrent accredit safety | Attendance service + tests | AttendanceRepresentationTests | PASS |
| REQ-006-05 | EO-006 | Quorum uses representation coefficient | `QuorumService` / engine | QuorumEngineTests + QuorumIntegration | PASS |
| REQ-006-06 | EO-006 | Quorum snapshot reasons (incl. voting open/close) | Quorum snapshots API | QuorumIntegrationTests | PASS |
| REQ-006-07 | EO-006 | Multi-tenant unit tamper rejection | Tenant guards | CrossTenant / ManipulatedId | PASS |
| REQ-006-08 | EO-006 | SignalR ≠ legal presence (TemporarilyDisconnected in quorum) | AttendanceStatus + Quorum | Unit/integration design | PARTIAL |
| REQ-006-09 | EO-006 | Power revoke mid-assembly | — | — | MISSING |
| REQ-006-10 | EO-006 | 8-user browser check-in / human | — | — | NOT TESTED |
| REQ-007-01 | EO-007 | Nested room-state agenda + speakerQueue | `AssemblyRoomService` + JS normalize | AssemblyRoomStateTests | PASS |
| REQ-007-02 | EO-007 | Present motion; one-active present rule | `MotionsController` / service | RoomOrchestrationTests | PASS |
| REQ-007-03 | EO-007 | Vote open requires Presented motion | Voting open rules | RoomOrchestrationTests | PASS |
| REQ-007-04 | EO-007 | Agenda change blocked while voting open | Agenda active + room rules | RoomOrchestration / unit | PASS |
| REQ-007-05 | EO-007 | Speaker request / grant / complete / reject / skip | `SpeakersController` + UI | Orchestration partial | PARTIAL |
| REQ-007-06 | EO-007 | Pause/Resume distinct audits; Paused→Completed | Lifecycle + audit | Lifecycle unit + AuditTests | PASS |
| REQ-007-07 | EO-007 | Lifecycle buttons permission-gated | Policies + UI | AuthorizationTests | PARTIAL |
| REQ-007-08 | EO-007 | LiveKit floor A/V enforce on grant | Meeting publish grant only (token) | MeetingPublishGrantTests | PARTIAL |
| REQ-007-09 | EO-007 | Owner cancel own speaker request | — | — | MISSING |
| REQ-007-10 | EO-007 | 8-user browser orchestration | — | — | NOT TESTED |
| REQ-008-01 | EO-008 | Evidence package from system facts | `AssemblyEvidenceService`, evidence UI | EvidenceMinutesTests | PASS |
| REQ-008-02 | EO-008 | Fact-only minutes document | Minutes API + `minutes.html` | EvidenceMinutesTests | PASS |
| REQ-008-03 | EO-008 | Decision register projection DEC-YYYY-NNNN | Evidence/minutes projection | EvidenceMinutesTests | PASS |
| REQ-008-04 | EO-008 | Completeness engine (operational) | Completeness in evidence path | EvidenceMinutesTests | PARTIAL |
| REQ-008-05 | EO-008 | Closure final quorum snapshot | Complete + quorum snapshot | Integration evidence/lifecycle | PASS |
| REQ-008-06 | EO-008 | Minutes/Evidence UI + print CSS | `minutes.html`, `evidence.html` | Print path only | PARTIAL |
| REQ-008-07 | EO-008 | Persisted minutes versions / finalize | — | — | MISSING |
| REQ-008-08 | EO-008 | Server-generated PDF | — | — | MISSING |
| REQ-008-09 | EO-008 | 8-user browser evidence/minutes certification | — | — | NOT TESTED |
| REQ-009-01 | EO-009 | `IMeetingProvider` abstraction (no LiveKit in business) | `IMeetingProvider`, `LiveKitMeetingProvider`, `MeetingService` | Architecture + MeetingPublishGrant | PASS |
| REQ-009-02 | EO-009 | Backend-only join token mint | `MeetingController` `POST join-token` | MeetingTokenSecurityTests | PASS |
| REQ-009-03 | EO-009 | Server-derived `canPublish` (moderate or Granted floor) | `MeetingService.ResolveCanPublishAsync` | MeetingPublishGrantTests + MeetingTokenSecurityTests | PASS |
| REQ-009-04 | EO-009 | Token TTL ≤ 15 minutes | `MeetingService.DefaultTokenTtl` | MeetingPublishGrantTests | PASS |
| REQ-009-05 | EO-009 | Lobby device check (camera/mic/selects) | `lobby-app.js`, `lobby.html` | None (UI) | PASS |
| REQ-009-06 | EO-009 | Lobby mic level + join gate (accredited + joinable) | `lobby-app.js` | None (UI) | PASS |
| REQ-009-07 | EO-009 | Media tiles / mute controls in room | `meeting.js`, assembly CSS | None | PASS |
| REQ-009-08 | EO-009 | Governance-only when media unavailable | `meeting.js` media state | Code; LiveKit human | PASS |
| REQ-009-09 | EO-009 | Media disconnect ≠ auto legal attendance removal | Attendance engine + media separation | Design; human | PASS |
| REQ-009-10 | EO-009 | Hybrid cockpit (in-person/virtual/represented) | `room-app.js` `#hybrid-cockpit` | None | PASS |
| REQ-009-11 | EO-009 | Media incident strip / reconnect UX | `meeting.js`, `#incident-strip` | None | PASS |
| REQ-009-12 | EO-009 | LiveKit human camera/mic/mute/leave | LiveKit runtime | E2E SKIP | MANUAL ACCEPTANCE REQUIRED |
| REQ-009-13 | EO-009 | LiveKit reconnect under real A/V | Client reconnect handlers | — | NOT TESTED |
| REQ-009-14 | EO-009 | 8-participant virtual room | — | — | NOT TESTED |
| REQ-009-15 | EO-009 | Cross-tenant meeting room rejection | Meeting room GET | MeetingTokenSecurityTests | PASS |
| REQ-010-01 | EO-010 | Full controller/page inventory | `docs/AUDIT/EO-010/00-TEST-INVENTORY.md` | Doc artifact | PASS |
| REQ-010-02 | EO-010 | Adversarial authz / tenant / ID manipulation | SecurityTests suite | Authorization, CrossTenant, ManipulatedId | PASS |
| REQ-010-03 | EO-010 | Adversarial voting / attendance concurrency | IntegrationTests | Voting + Attendance suites | PASS |
| REQ-010-04 | EO-010 | E2E assembly meeting happy path | `AssemblyMeetingE2ETests` | 2 PASS | PASS |
| REQ-010-05 | EO-010 | E2E LiveKit video room | Same file Skip | 1 SKIP | BLOCKED |
| REQ-010-06 | EO-010 | Full route crawl every verb/payload | — | Partial via suites only | PARTIAL |
| REQ-010-07 | EO-010 | Full UI button/dialog adversarial matrix | — | — | NOT TESTED |
| REQ-010-08 | EO-010 | 300-participant synthetic scale | — | — | NOT TESTED |
| REQ-010-09 | EO-010 | Open P0/P1 defect count = 0 | `DEFECT-REGISTER.md` | Manual register | PASS |
| REQ-010-10 | EO-010 | Unconditional production certification | — | Human A/V + gaps | NOT TESTED |

---

## Status roll-up (honest)

| Band | EOs / themes |
|------|----------------|
| Mostly PASS / PARTIAL (API + automated) | EO-005 voting integrity; EO-006–008 representation, quorum, orchestration, evidence facts |
| PASS (code/API); media human MANUAL | EO-009 newly remediated: `canPublish`, TTL, lobby gate, tiles, governance-only, hybrid, incidents |
| MISSING | Minutes versioning; server PDF; power revoke mid-assembly; owner cancel speaker |
| NOT TESTED / MANUAL | LiveKit human A/V; Safari/iOS; 8-user browser; 300-participant; full EO-010 UI adversarial |
| Adversarial EO-010 | Partially executed via existing Security / Integration / E2E — **not** a full EO-010 campaign |

**Row count:** 70 representative requirements.
