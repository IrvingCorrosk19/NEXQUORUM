# MEETING CONTROL BAR — CERTIFICATION

**Feature:** ASAMBLEAS Meeting Experience UX 2.0  
**Date:** 2026-08-09 / 2026-08-10  
**Scope:** Bottom MeetingControlBar + LiveKit A/V one-click + hand raise governance + drawers  
**Commits:** `bb805d4` … (meeting UX) + hotfixes mux4

## Summary

Replaced scattered mic/camera/speak controls with a fixed bottom **Meeting Control Bar**. Hand raise maps to speaker-request governance (FIFO + president grant). Mic/camera act on LiveKit tracks. Leave ≠ End assembly. Governance floor is distinct from microphone state.

## Checklist

| Criterion | Result | Notes |
|-----------|--------|-------|
| MEETING CONTROL BAR | PASS | `#meeting-control-bar` fixed bottom |
| MIC ON/OFF | PASS | One-click `#btn-mic` → LiveKit |
| CAMERA ON/OFF | PASS | One-click `#btn-cam`; camera-off tile |
| REMOTE CAMERA UPDATE | PASS* | LiveKit subscribe path; dual-browser visual matrix still limited by automation media permissions |
| RAISE HAND | PASS | Browser: button → `Bajar` + floor banner; API OK |
| LOWER HAND | PASS | Browser + `POST .../cancel` |
| SPEAKER QUEUE | PASS | President drawer + sidebar; FIFO verified |
| GRANT FLOOR | PASS | President grants; owner sees `TIENES LA PALABRA` |
| ACTIVE SPEAKER | PASS | LiveKit `.is-speaking` |
| GOVERNANCE SPEAKER | PASS | Chip + `.official-speaker`; copy distinguishes mic |
| PARTICIPANTS DRAWER | PASS | 8 participants listed in drawer |
| LEAVE | PASS | Confirm → lobby; does not complete assembly |
| END SESSION RBAC | PASS | Owner end blocked (403); president has control |
| DESKTOP | PASS | Centered bar + auto-hide (pinned on mobile/voting) |
| TABLET | PASS | Adaptive width |
| MOBILE | PASS | Control bar + video-first CSS; touch targets |
| ACCESSIBILITY | PASS | Dynamic aria-labels; focus-visible; Esc closes drawers |
| LIVEKIT | PASS | Join token + `canPublish` on VPS |
| SIGNALR | PASS | Queue/floor updates; reconnect overlay no longer blocks on brief reconnect |
| MULTITENANT | PASS | Tenant query filters + hub groups |
| ASSEMBLY ISOLATION | PASS | Hub scoped by assemblyId |
| SECURITY | PASS | Owner grant/end blocked; cancel own-only |
| BROWSER E2E | PASS | Raise/lower/grant/participants drawer on VPS HTTPS |
| VPS | PASS | Deployed; health 200; assets mux4 |

\*Remote peer video appearance depends on browser media permissions in the test harness.

## Evidence

### API smoke (`artifacts/vps/meeting-ux-e2e.ps1`) — ALL_PASS=True

- MULTI_TAB_IDEMPOTENT
- FIFO_COUNT / FIFO_ORDER (101 → 102 → 103)
- OWNER_GRANT_BLOCKED / OWNER_END_BLOCKED
- GRANT_FLOOR / GOVERNANCE_SPEAKER
- LOWER_HAND / LOWER_HAND_QUEUE
- COMPLETE_FLOOR
- LIVEKIT_TOKEN / LIVEKIT_CAN_PUBLISH

### Browser (VPS HTTPS)

- Owner: raise → label **Bajar** + banner **Mano levantada**
- Owner: lower → idle
- Owner: participants drawer shows 8
- President: queue drawer + **Conceder palabra**
- Owner after grant: **TIENES LA PALABRA** + handState `floor` + governance chip

## Backend

- Idempotent `RequestAsync`
- `CancelOwnAsync` + `POST /speakers/cancel`
- Audit `SPEAKER_CANCELLED`

## Frontend

- MeetingControlBar, drawers, device settings
- Hand state sync (`dataset.handState`)
- Soft SignalR reconnect (no fullscreen flash on brief drops)
- Mobile video-first (sidebar hidden ≤767px)

## P0 OPEN

_(none for control-bar scope)_

## P1 OPEN

1. Productize `OPEN_AUDIO` / `MODERATED_AUDIO` policy flags
2. Unit code on queue DTO rows
3. Dual-browser LiveKit camera appearance under automation media-permission constraints

## FINAL VERDICT

**CERTIFIED**
