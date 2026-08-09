# EO-009 — Completion Report

**Status:** INTERIM — **NOT CERTIFIED**  
**Date:** 2026-08-09  
**Baseline:** `fff3ffc` + local EO-009 media remediation (commit pending)

## Delivered (code / API)

- Server-derived `canPublish` (role moderate OR granted floor); client cannot force publish
- Join token TTL = 15 minutes
- Lobby: device enumeration, camera/mic prefs, mic level, join gated on accreditation + assembly status
- Media connection states: connecting / connected / reconnecting / disconnected / **governance-only**
- Hybrid presence cockpit strip (in-person / virtual / represented / logical)
- Media incident strip (reconnect UX)
- Unit: `MeetingPublishGrantTests`; Security: `MeetingTokenSecurityTests`

## Human A/V

| Gate | Status |
|------|--------|
| LiveKit camera / microphone / mute / unmute / leave | **MANUAL ACCEPTANCE REQUIRED** |
| Lobby preview with real devices | **MANUAL ACCEPTANCE REQUIRED** |
| Media reconnect under live A/V | **NOT TESTED** |
| 8-user virtual room | **NOT TESTED** |
| 300-participant media | **NOT TESTED** |

## Matrix (abbrev.)

| Area | Status |
|------|--------|
| Provider abstraction (`IMeetingProvider`) | PASS (code) |
| Token mint backend-only | PASS (API + security tests; LiveKit body depends on credentials) |
| `canPublish` server authority | PASS (unit + security) |
| 15m TTL | PASS (unit) |
| Lobby join gate / devices | PASS (code) — human A/V **MANUAL ACCEPTANCE REQUIRED** |
| Media ≠ governance attendance | PASS (code design) — human proof **NOT TESTED** |
| Hybrid cockpit | PASS (code) |
| LiveKit human A/V | **MANUAL ACCEPTANCE REQUIRED / NOT TESTED** |

## Verdict

**EO-009 NOT CERTIFIED** — media remediation implemented in code/API; **Human A/V MANUAL ACCEPTANCE REQUIRED**. Do not claim virtual-assembly GO without live LiveKit drill.
