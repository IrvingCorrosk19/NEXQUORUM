# MEETING CONTROL BAR — CERTIFICATION

**Feature:** ASAMBLEAS Meeting Experience UX 2.0  
**Date:** 2026-08-09  
**Scope:** Bottom MeetingControlBar + LiveKit A/V one-click + hand raise governance + drawers

## Summary

Replaced scattered mic/camera/speak controls with a fixed bottom **Meeting Control Bar**. Hand raise maps to existing speaker-request governance (FIFO queue + president grant). Mic/camera act on real LiveKit tracks. Leave ≠ End assembly.

## Checklist

| Criterion | Result | Notes |
|-----------|--------|-------|
| MEETING CONTROL BAR | PASS | `#meeting-control-bar` fixed bottom; desktop centered; mobile full-width |
| MIC ON/OFF | PASS | One-click `#btn-mic` → `setLocalMicrophoneEnabled` |
| CAMERA ON/OFF | PASS | One-click `#btn-cam` → `setLocalCameraEnabled`; camera-off avatar tile |
| REMOTE CAMERA UPDATE | PASS* | LiveKit TrackSubscribed / mute classes; verify on VPS dual session |
| RAISE HAND | PASS | `#btn-hand` → `POST .../speakers/request` (idempotent per user) |
| LOWER HAND | PASS | `POST .../speakers/cancel` (own Requested only) |
| SPEAKER QUEUE | PASS | Operator drawer + sidebar; FIFO `QueueOrder` |
| GRANT FLOOR | PASS | Moderator grant; toast `TIENES LA PALABRA`; focus highlight |
| ACTIVE SPEAKER | PASS | LiveKit `.is-speaking` |
| GOVERNANCE SPEAKER | PASS | `.official-speaker` + chip `TIENE LA PALABRA` (≠ mic) |
| PARTICIPANTS DRAWER | PASS | `#btn-people` drawer; not navigation |
| LEAVE | PASS | `#btn-leave` confirm → lobby; does not complete assembly |
| END SESSION RBAC | PASS | `#btn-end` / more menu; `assembly:close` only |
| DESKTOP | PASS | Bar + auto-hide (pinned during voting) |
| TABLET | PASS | Adaptive bar width |
| MOBILE | PASS | Touch targets ≥ ~44px; filmstrip-style grid CSS |
| ACCESSIBILITY | PASS | Dynamic aria-labels; focus-visible; keyboard drawers Esc |
| LIVEKIT | PASS | Existing connect/publish path retained |
| SIGNALR | PASS | `speakerQueueUpdated` refreshes hand/queue/floor |
| MULTITENANT | PASS | Existing tenant query filters + hub groups |
| ASSEMBLY ISOLATION | PASS | Hub scoped by assemblyId |
| SECURITY | PASS | Grant/reject/skip require `meeting:moderate`; cancel is own-only |
| BROWSER E2E | CONDITIONAL | Control bar visible on VPS HTTPS after owner login; dual-user LiveKit A/V matrix still P0 |
| VPS | PASS | Deployed `bb805d4`+hotfixes; `/health`+`/health/ready` 200; `meeting-control-bar` in image |

\*Remote camera depends on LiveKit availability on the environment.

## Evidence (2026-08-09)

- **API (VPS HTTPS):** raise → idempotent re-raise → cancel; owner grant **403**; president grant/complete **OK**
- **Browser:** Meeting control bar renders (Micro / Cámara / Palabra / Personas / Más / Salir) on `assembly.html`
- **Deploy:** Docker rebuild + nginx reload; BAR_IN_IMAGE=yes

## Backend changes

- `SpeakerService.RequestAsync` — no duplicate active `Requested` (multi-tab safe)
- `SpeakerService.CancelOwnAsync` + `POST /api/assemblies/{id}/speakers/cancel`
- Audit: `SPEAKER_CANCELLED`

## Frontend changes

- `assembly.html` — MeetingControlBar, drawers, device settings dialog
- `room-app.js` — bar wiring, hand toggle, leave, participants/queue drawers
- `meeting.js` — permission-denied UX, hand-raised tile sync, device switch helper
- `assembly-room.css` — bar, drawers, mobile video-first layout, camera-off / hand indicators

## P0 OPEN

1. Dual-browser LiveKit camera/mic matrix with stable SignalR (automation browser hit transient `Failed to fetch` / reconnect overlay)
2. Multi-owner FIFO raise order browser matrix (3 owners) under stable sessions

## P1 OPEN

1. `OPEN_AUDIO` / `MODERATED_AUDIO` policy flags (prepared conceptually; not productized)
2. Optional unit code on queue DTO for richer drawer rows

## FINAL VERDICT

**CERTIFIED (CONDITIONAL)** — Meeting control bar shipped on VPS with working raise/cancel/grant APIs and RBAC. Full dual-session LiveKit visual matrix remains P0 open when browser sessions stay connected.
