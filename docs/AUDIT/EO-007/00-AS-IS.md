# EO-007 — AS-IS Assessment

**Date:** 2026-08-08  
**App:** http://localhost:5188  
**Status:** OBSERVED before orchestration hardenings

## Mission chain (current)

```text
CheckIn → Start → Agenda activate (API) → Speakers (API) → Present motion (API only)
→ Open/Close voting (API) → Complete
```

Browser cockpit **broken on hydrate** despite working APIs (E2E uses APIs directly).

---

## Classification

| Area | Status | Notes |
|------|--------|-------|
| Lifecycle enum + `AssemblyLifecycle` | WORKING | Server authority |
| start-checkin / start / pause / resume / complete | WORKING (API) | |
| Pause/Resume audit | BROKEN | Both write `ASSEMBLY_STARTED` |
| Paused → Completed | BROKEN UI/domain | UI shows End; domain rejects |
| Agenda list + activate | WORKING (API) | Seed 4 items; no CRUD (OK for EO-007) |
| Room hydrate agenda shape | BROKEN | API array vs UI `{ items }` |
| Speaker request/grant/complete/reject | WORKING (API) | |
| Skip speaker UI | MISSING | API may exist |
| Room hydrate speaker queue | BROKEN | Array vs `{ queue, currentId }` |
| Present motion API | WORKING | |
| Present motion UI | MISSING | Blocks browser vote loop |
| Room hydrate motion/session | BROKEN | `activeMotion` / `openVotingSession` not mapped |
| SignalR after mutations | WORKING | |
| Secretary lifecycle buttons | CONFUSING | Sees Operator chrome → 403 without manage/close |
| Command bar / next action | MISSING | Ad-hoc buttons |
| LiveKit floor enforcement | MISSING | Display-only (LiveKit optional) |

---

## Keep

- `AgendaService.SetActiveItemAsync`, `SpeakerService` grant single-floor, `MotionService.Present`, EO-005 voting integrity, SignalR publishers.

## Minimal fix path

1. Normalize room-state ↔ UI contract  
2. Present Motion + Skip in UI  
3. Pause/Resume audits; allow or gate End from Paused  
4. Permission-based lifecycle chrome  
5. One active motion on present; vote from Presented  

---

## Verdict

**EO-007 NOT CERTIFIED** at AS-IS. Backend orchestration exists; room cockpit contract must be fixed before browser certification.
