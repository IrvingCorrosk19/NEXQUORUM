# ASAMBLEAS — Realtime Audio Echo Remediation

**Date:** 2026-08-16  
**LiveKit Client SDK:** `2.9.1` (CDN `livekit-client@2.9.1` in `assembly.html`)  
**Scope:** Client capture/playback only (no Egress / recording infra changes)

---

## ROOT CAUSE

**Primary (app bug — self-playback):**  
`RoomEvent.LocalTrackPublished` and `syncParticipantPublications()` called `track.attach()` on **local microphone audio** and appended an autoplaying `<audio>` into the local participant tile.

Topology before:

```
Local mic → LiveKit publish
          ↘ attach() → <audio autoplay> → LOCAL SPEAKERS  ← self-echo
```

That alone explains hearing your own voice in ASAMBLEAS even with headphones (software loop), and worsens acoustic echo with speakers.

**Secondary:** Mic capture used bare `audio: true` / `setMicrophoneEnabled(true)` without centralized `echoCancellation` / `noiseSuppression` / `autoGainControl` defaults.

**Not primary:** Egress/MP4, quorum, voting. Mic meter already used AnalyserNode only (no `AudioContext.destination`).

---

## Topology after

```
Local mic → AEC/NS/AGC (capture defaults) → LiveKit publish
Local mic ──X──> local speakers

Remote audio TrackSid → exactly one <audio> in that participant tile
```

---

## Changes

| Item | Change |
|---|---|
| `ASAMBLEAS_AUDIO_CAPTURE_DEFAULTS` | Central policy: AEC + NS + AGC |
| `Room({ audioCaptureDefaults })` | LiveKit 2.9.1 Room options |
| `setMicrophoneEnabled(enabled, audioOpts)` | Same defaults + optional `deviceId` |
| Local audio attach | Skipped in `attachTrackToTile`, `LocalTrackPublished`, `syncParticipantPublications` |
| Screen share | `selfBrowserSurface: "exclude"` to reduce tab-audio loop |
| `auditRealtimeAudioTopology()` | Diagnostic for e2e / console |
| Cache bust | `assembly.html` `room-app.js?v=audio1` |

**Files:**  
`src/Asambleas.Web/wwwroot/js/modules/meeting.js`  
`src/Asambleas.Web/wwwroot/assembly.html`  
`tools/e2e/realtime-audio-echo-cert.cjs`

**Not modified:** Recording/Egress, RBAC, quorum, voting.

---

## Automated evidence

Structural cert (`tools/e2e/realtime-audio-echo-cert.cjs`):

- Module contains AEC/NS/AGC defaults: **PASS**
- Module skips local audio attach: **PASS**
- Verdict: `STRUCTURAL AUDIO PIPELINE — PASS (HUMAN AEC GATE PENDING)`

Build: **PASS** (0 errors)

---

## Human / acoustic gates

| Gate | Status |
|---|---|
| Software self-playback removed | PASS (code + structural) |
| HUMAN SELF-ECHO (speakers) | **PENDING USER** |
| HUMAN SELF-ECHO (headphones) | **PENDING USER** |
| Two-participant production | **PENDING** (after human local) |
| Recording regression | **NOT RE-RUN** (no Egress changes; smoke after deploy) |

Per mission rules: acoustic PASS cannot be declared from Playwright alone.

---

## Recommended human check (local `https://localhost:7188`)

1. Two browsers / devices, mic on, speakers on.  
2. A says “prueba uno dos tres” — A must **not** hear ASAMBLEAS play back A’s voice.  
3. B hears A once.  
4. Repeat with headphones.  
5. Optional: `auditRealtimeAudioTopology()` in console → `localSelfPlaybackAttachments` must be `0`.

---

## Deploy policy

Do **not** push/VPS until human speaker/headphone gate is confirmed by a person, unless explicitly overridden.
