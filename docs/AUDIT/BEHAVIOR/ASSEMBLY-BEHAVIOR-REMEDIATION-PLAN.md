# ASSEMBLY BEHAVIOR REMEDIATION PLAN

**Audit date:** 2026-08-12  
**Rule:** Diagnose first. This plan is ordered work — **do not deploy until P0s are implemented and re-audited.**

---

## Priority order

### P0 — integrity / lifecycle critical

| # | ID | Fix | Acceptance |
|---|-----|-----|------------|
| 1 | BEH-Q-001 | Guard `RecalculateAndSnapshotAsync` / presence updates: **deny** when `Completed` or `Cancelled` | No new quorum rows after Complete except explicit admin forensic tool |
| 2 | BEH-HUB-001 | `AssemblyHub.JoinAssembly` + `EnsureCanJoinAssemblyAsync`: status gate (deny or historical read-only group without `MarkConnected`) | Completed join does not mutate attendance/quorum |
| 3 | BEH-ROOM-UI-001 | Remove/repurpose “Sala” for Completed/Cancelled in `ia-nav.js`, PH overflow menus, owner portal deep links | Primary historical CTAs only; Sala → Ver grabación / expediente if needed |
| 4 | BEH-HIST-BANNER-001 | Historical mode banner + `data-mode=historical` without A/V join attempt | User cannot mistake history for live |

### P1 — important flow / API holes

| # | ID | Fix | Acceptance |
|---|-----|-----|------------|
| 5 | BEH-REC-001 | `RecordingService.StartRecordingAsync` status gate | Cannot start recording on Completed/Cancelled/Draft |
| 6 | BEH-ACTA-001 | Seal minutes/expediente package hash at Complete | GET returns sealed document; package drift impossible |
| 7 | BEH-Q-002 | Freeze eligible-units denominator for Completed (use AssemblyEnd snapshot only) | Changing Units tomorrow does not change displayed historical quorum |
| 8 | BEH-TR-001 | Explicit Draft→Scheduled publish API/UI | Draft is not a dead-end |
| 9 | BEH-URL-001 | Direct `lobby.html` / `assembly.html` for Completed → redirect to dashboard/minutes or read-only shell | No LiveKit fetch attempt; clear historical UX |
| 10 | BEH-CTA-001 | Cancelled primary CTA + PH row overflow (hide Reprogramar/Convocatoria when terminal) | CTA matrix matches state matrix |

### P2 — secondary behavior

| # | ID | Fix |
|---|-----|-----|
| 11 | BEH-CONV-001 | Block convocation send/resend on Completed/Cancelled (or allow audit-only resend with reason) |
| 12 | BEH-SURVEY-001 | Survey create/publish/submit gated by assembly status |
| 13 | BEH-SPK-001 | Speaker grant/reject/skip gated like Request |
| 14 | BEH-MOT-001 | Motion update blocked when assembly Completed/Cancelled |
| 15 | BEH-SCHED-JOIN-001 | Product decision: Scheduled LiveKit join — lobby-only vs deny until CheckIn |
| 16 | BEH-REFRESH-001 | Client poll/SignalR status → disable ops when status flips to Completed |

### P3 — cosmetic / naming

| # | ID | Fix |
|---|-----|-----|
| 17 | BEH-NAME-001 | Document that API `Completed` = UI “Finalizada”; optional alias in docs only — avoid dual enum |
| 18 | BEH-LOBBY-SYN-001 | Remove stale `CheckInOpen` synonym in lobby JS |
| 19 | Empty/loading copy for historical modules | Polish |

---

## Suggested implementation waves

**Wave A (P0):** Hub + quorum freeze + UI Sala/historical banner  
**Wave B (P1):** Recording gate + acta seal + URL redirects + CTA cleanup + Draft publish  
**Wave C (P2–P3):** Convocation/survey/speaker/motion + naming hygiene  

**Re-audit gate:** Re-run master checklist; P0 must be 0 before any “behaviorally correct” claim. No certification until E2E §71–73 (Finalized / historical coefficient / Cancelled) pass with API attack cases.

---

## Explicit non-goals for Wave A

- Do not invent `Finalized` enum separate from `Completed` unless product requires two-phase close.
- Do not mass-refactor IA navigation beyond lifecycle CTAs.
- Do not deploy partial Wave A without hub+quorum together (UI-only hide is insufficient — see BEH-BACKEND-001).
