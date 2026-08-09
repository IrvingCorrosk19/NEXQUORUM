# EO-009 — Virtual AS-IS (pre-remediation) + remediation delta

**Date:** 2026-08-09  
**Baseline commit:** `fff3ffc` (EO-006–EO-008 delivered)  
**Scope:** Media / lobby / meeting provider only. Governance authority remains ASAMBLEAS.

---

## AS-IS before remediation

| Area | Observed |
|------|----------|
| Provider abstraction | `IMeetingProvider` + `LiveKitMeetingProvider` existed; join path present |
| Token mint | Backend `POST .../meeting/join-token` |
| `canPublish` | Client influence / weak server derivation risk; owners could be over-granted |
| Token TTL | Not enforced as short-lived 15-minute standard |
| Lobby | Basic entry; limited device enumeration / mic feedback / join gate |
| Room tiles & A/V controls | Minimal / inconsistent with governance UX |
| Media vs governance | LiveKit absence historically blocked readiness perception; separation incomplete in UX |
| Hybrid presence | No clear in-person / virtual / represented cockpit strip |
| Incidents | Weak / absent media-incident strip |

LiveKit human A/V was already **BLOCKED / NOT TESTED** without credentials (E2E skip).

---

## What was fixed (EO-009 media remediation — local, pre-commit)

| Fix | Location | Notes |
|-----|----------|-------|
| Server-derived `canPublish` | `MeetingService.ResolveCanPublishAsync` — moderators always; owners only with `SpeakerRequestStatus.Granted` | Client query flags ignored |
| 15-minute token TTL | `MeetingService.DefaultTokenTtl` | Unit-covered |
| Lobby devices / mic / join gate | `lobby-app.js`, `lobby.html` | Device selects, mic meter, accredited + joinable gate |
| Tiles / media controls | `meeting.js`, `assembly-room.css`, `room-app.js` | Connection states incl. reconnect |
| Governance-only mode | `meeting.js` media state `governance-only` | Media down ≠ legal attendance drop |
| Hybrid cockpit | `#hybrid-cockpit` in `room-app.js` | In-person / virtual / represented / logical totals |
| Incidents strip | `#incident-strip` + media reconnect incidents | UX only; not legal audit |

---

## Still NOT TESTED / MANUAL

- LiveKit camera/mic/mute/unmute/leave with real credentials — **MANUAL ACCEPTANCE REQUIRED**
- 8-participant human virtual assembly — **NOT TESTED**
- 300-participant scale — **NOT TESTED**
