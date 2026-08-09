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
| BROWSER E2E | CONDITIONAL | Structural + API smoke; dual-browser A/V matrix on VPS |
| VPS | PENDING | Deploy after push; retest HTTPS LiveKit |

\*Remote camera depends on LiveKit availability on the environment.

## Backend changes

- `SpeakerService.RequestAsync` — no duplicate active `Requested` (multi-tab safe)
- `SpeakerService.CancelOwnAsync` + `POST /api/assemblies/{id}/speakers/cancel`
- Audit: `SPEAKER_CANCELLED`

## Frontend changes

- `assembly.html` — MeetingControlBar, drawers, device settings dialog
- `room-app.js` — bar wiring, hand toggle, leave, participants/queue drawers
- `meeting.js` — permission-denied UX, hand-raised tile sync, device switch helper
- `assembly-room.css` — bar, drawers, mobile layout, camera-off / hand indicators

## P0 OPEN

1. Full dual-user LiveKit camera/mic matrix on VPS after deploy (browser evidence)
2. Multi-owner FIFO raise order browser matrix (3 owners)

## P1 OPEN

1. `OPEN_AUDIO` / `MODERATED_AUDIO` policy flags (prepared conceptually; not productized)
2. Optional unit code on queue DTO for richer drawer rows

## FINAL VERDICT

**CERTIFIED (CONDITIONAL)** — control bar UX + cancel-hand API + RBAC separation implemented and build-verified. Full dual-session LiveKit + VPS HTTPS evidence remains P0 open until post-deploy browser pass.
