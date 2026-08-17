# ASAMBLEAS — Speaker Request Lifecycle Certification

**Date:** 2026-08-16  
**Local:** `https://localhost:7188`  
**Production:** `https://asambleas.164.68.99.83.nip.io`

---

## ROOT CAUSE

1. **Stale UI → cancel race:** `#btn-hand` decided cancel vs request from local `state.queue` (`mySpeakerRequest()`). Double-click, two tabs, or SignalR lag could call `POST /speakers/cancel` when no `Requested` row remained.
2. **Non-idempotent backend:** `SpeakerService.CancelOwnAsync` threw `DomainException("No active speaker request to cancel.")`.
3. **Raw English in giant alert:** `room-app.js` used `showError(error.message)`, dumping ProblemDetails `detail` into `#room-alert`.

Translating the string alone would not fix desync; cancel is now idempotent and the UI hydrates + uses Spanish toasts.

---

## FIX SUMMARY

| Layer | Change |
|-------|--------|
| Backend | `CancelOwnAsync` idempotent (200 + prior/stub). `RequestAsync` idempotent when already Granted. `CompleteOwnAsync` + `POST .../complete-own` for owner end-turn. |
| Frontend | Hand mutex + phases (`requesting` / `cancelling` / `completing`). Queue position on button. Toast UX. `mapSpeakerError` never surfaces raw English. Active queue filter for operator list. |
| i18n | Spanish (and EN) strings for the full lifecycle. |

**Recording / LiveKit audio:** not modified.

---

## LOCAL E2E (`tools/e2e/speaker-lifecycle-cert.cjs`)

All required steps **PASS** including:

- IDEMPOTENT / DOUBLE cancel
- DOUBLE request (same id)
- TWO TABS queued → cancel sync
- GRANT → SPEAKING → COMPLETE
- RELOAD while queued
- RAW ENGLISH message count = **0**

Evidence: `tools/e2e/speaker-lifecycle-results/`

---

## FILES

- `src/Asambleas.Application/Speaker/SpeakerService.cs`
- `src/Asambleas.Web/Controllers/SpeakersController.cs`
- `src/Asambleas.Web/wwwroot/js/modules/speakers.js`
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js`
- `src/Asambleas.Web/wwwroot/js/i18n/es-PA.js`
- `src/Asambleas.Web/wwwroot/js/i18n/en.js`
- `src/Asambleas.Web/wwwroot/assembly.html`
- `tools/e2e/speaker-lifecycle-cert.cjs`

---

## COMMIT / PUSH / VPS / PRODUCTION

| Step | Result |
|------|--------|
| COMMIT | `15143a9` — `fix(speaker): synchronize raise-hand request lifecycle` |
| PUSH | PASS |
| VPS DEPLOY | PASS — image rebuilt; `complete-own` + Spanish UX live |
| PRODUCTION E2E | PASS — `ASAMBLEAS_BASE_URL=https://asambleas.164.68.99.83.nip.io` |

---

## FINAL STATUS

**SPEAKER REQUEST LIFECYCLE — PRODUCTION CERTIFIED**

