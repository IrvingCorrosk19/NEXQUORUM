# Browser Support — ASAMBLEAS

**Date:** 2026-08-09  
**Product:** Assembly module only

---

## Claimed for automated / CI-style runs

| Browser | Status | Notes |
|---------|--------|-------|
| **Google Chrome** (current stable) | Claimed | Primary target for automated in-process / Playwright-style paths |
| **Microsoft Edge** (Chromium, current stable) | Claimed | Same Chromium engine assumptions as Chrome |

Automated suites in this repo are API / in-process E2E oriented; they do **not** prove full Chromium UI matrix for every page.

---

## Manual only

| Browser / platform | Status | Notes |
|--------------------|--------|-------|
| **Safari** (macOS) | MANUAL | Not covered by automated suites |
| **iOS Safari** | MANUAL | Touch, media permissions, viewport — not automated |
| Other mobile browsers | MANUAL / NOT CLAIMED | No certification claim |

---

## LiveKit A/V

| Capability | Status |
|------------|--------|
| Camera / microphone / publish / subscribe | **MANUAL** |
| Mute / unmute / leave / reconnect under real WebRTC | **MANUAL** |
| Automated LiveKit E2E | **SKIP** — credentials required (`AssemblyMeetingE2ETests` LiveKit case) |

Do not claim production A/V readiness from Chromium automated green alone.
