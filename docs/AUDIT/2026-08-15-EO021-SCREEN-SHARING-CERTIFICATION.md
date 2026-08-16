# EO-021 ADDENDUM — NATIVE SCREEN SHARING CERTIFICATION

**Date:** 2026-08-15  
**Environment:** Development — `https://localhost:7188`  
**VPS / Production / Deploy:** NOT PERFORMED  

---

## Verdict (automatable)

```text
EO-021 SCREEN SHARING IMPLEMENTATION COMPLETE — P0=0 / P1=0 — LOCALHOST ONLY — WAITING FOR USER MANUAL SCREEN-SHARE ACCEPTANCE — NO VPS DEPLOYMENT PERFORMED.
```

Native `getDisplayMedia` picker steps remain **PENDING USER ACCEPTANCE** (not faked PASS).

---

## Architecture investigation (decision)

| Topic | Finding |
| --- | --- |
| VIDEO ARCHITECTURE | LiveKit via `meeting.js` + `MeetingController` + `LiveKitMeetingProvider` |
| SIGNALING | LiveKit SFU for media; app JWT grants `canPublishSources` |
| REALTIME HUB | SignalR `AssemblyHub` — governance + **ScreenShareUpdated** state only |
| PEER MODEL | LiveKit Room / participants (no custom mesh) |
| MEDIA TRACK MANAGEMENT | **Additional screen track** via `localParticipant.setScreenShareEnabled` — camera retained |
| ROOM STATE | `AssemblyRoomStateDto.ScreenShare` + GET `/meeting/screen-share` |
| RECONNECTION | SignalR rehydrate + LiveKit reconnect preserve A/V; share state from server |
| AUTHORIZATION | Permission `meeting:screenshare` (+ moderate roles). Owners default deny. LiveKit token omits `screen_share` sources for unauthorized users. Single active presenter in `InMemoryScreenShareCoordinator`. |

**Track strategy:** additional LiveKit screen publication (not `replaceTrack` on camera), so cameras continue as filmstrip while screen is the main stage.

**SignalR does not carry video frames.**

---

## What was implemented

- Toolbar control `#btn-screen` (Compartir / Detener)
- Presenter banner + stage/filmstrip CSS layout
- Server claim/release APIs + force stop for moderators
- LiveKit `canPublishSources` gate for screen
- `screenShareUpdated` realtime event
- Presenter leave / assembly complete cleanup
- Soft cancel UX when user dismisses the browser picker
- Soft messages (no DOMException / NotAllowedError in UI)

---

## Automatable matrix

| Gate | Result |
| --- | --- |
| NATIVE SCREEN SHARE UI (SS-001) | PASS |
| SCREEN SHARE AUTHORIZATION (SS-002 / token) | PASS |
| SINGLE ACTIVE PRESENTER (SS-019) | PASS |
| SCREEN SHARE RECEIVE (SS-004) | PENDING USER ACCEPTANCE |
| PRESENTER INDICATOR (SS-005) | PENDING USER ACCEPTANCE |
| AUDIO CONTINUITY (SS-006) | PENDING USER ACCEPTANCE |
| CAMERA CONTINUITY (SS-007) | PENDING USER ACCEPTANCE |
| VIDEO SESSION CONTINUITY | PENDING USER ACCEPTANCE |
| QUESTION DURING SHARE (SS-008) | PASS |
| VOTING DURING SHARE (SS-009–014) | PASS |
| STOP FROM APP (SS-016) | PASS |
| BROWSER TRACK ONENDED (SS-017) | PENDING USER ACCEPTANCE |
| MEDIA CLEANUP ×5 (SS-018 server) | PASS |
| OWNER RECONNECTION STATE (SS-020) | PASS |
| FINALIZATION CLEANUP (SS-022) | PASS |
| CROSS-ASSEMBLY ISOLATION (SS-023) | PASS |
| CROSS-PH ISOLATION (SS-024) | PASS |
| ACCESSIBILITY (SS-026) | PASS |
| CONSOLE (SS-027) | PASS |
| NETWORK (SS-028) | PASS |
| MANUAL GETDISPLAYMEDIA ACCEPTANCE | PENDING USER ACCEPTANCE |
| P0 OPEN | 0 |
| P1 OPEN | 0 |
| VPS DEPLOYMENT | NOT PERFORMED |

Machine-readable: `tools/e2e/eo021-results/screen-sharing-results.json`  
Runner: `tools/e2e/eo021-screen-sharing-e2e.cjs`

---

## MANUAL ACCEPTANCE TEST (required)

Native picker cannot be driven safely by browser automation. Run on **localhost** with three independent sessions:

```text
TAB A = PRESIDENTE / PHAdmin (authorized)
TAB B = OWNER A
TAB C = OWNER B
```

### Steps

1. Entrar como Presidente/PHAdmin autorizado.
2. Entrar a la sala (`assembly.html`) de una asamblea **InProgress**.
3. Activar cámara/micrófono.
4. Pulsar **Compartir pantalla**.
5. En el selector nativo, elegir una ventana (ej. Excel / PDF / navegador).
6. Confirmar que Owner A y Owner B ven la ventana **sin F5**.
7. Confirmar banner: “X está compartiendo pantalla” / “Estás compartiendo tu pantalla”.
8. Crear una pregunta al cuestionario **sin** detener el share.
9. Abrir votación.
10. Owner A vota; Owner B vota — presentación sigue visible.
11. Presidente ve progreso; cierra votación; resultado llega — share sigue activo.
12. **Detener presentación** desde ASAMBLEAS → layout normal.
13. Repetir share y detener con el control nativo del navegador (**Dejar de compartir**) → ASAMBLEAS debe detectar `track.onended` y limpiar estado.
14. Confirmar: audio no se destruye; cámaras siguen en filmstrip; no errores críticos en consola.

### Expected final line (after you confirm)

```text
EO-021 SCREEN SHARING — ACCEPTED — VIDEO + AUDIO + SCREEN SHARE + REALTIME VOTING COEXIST IN A SINGLE ASSEMBLY SESSION.
```

---

## Fullscreen + voting note

Fullscreen API is available on the stage (“Pantalla completa”). If a vote opens while fullscreen, browser security may limit overlays — UI keeps the voting chip/panel in the room; if vote UI is obscured, exit fullscreen (Esc) to cast. Vote never silently disappears without the open-voting chip.

---

## Absolute stop

```text
NO VPS.
NO DEPLOY.
NO PRODUCTION.
Keep https://localhost:7188 for manual acceptance.
```
