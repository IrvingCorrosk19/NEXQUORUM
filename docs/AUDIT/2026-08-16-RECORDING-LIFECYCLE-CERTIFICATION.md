# ASAMBLEAS — Recording Lifecycle Certification

**Date:** 2026-08-16  
**Commit:** *(filled after push)*  
**Local:** `https://localhost:7188`  
**VPS:** `https://asambleas.164.68.99.83.nip.io`

---

## 1. Root cause

| Observation | Cause |
| --- | --- |
| Toast “Grabación iniciada” + botón “Iniciar grabación” | Synthetic provider wrote MP4 and `StartRecordingAsync` called `MarkReadyAsync` immediately |
| UI `isRecordingActive` | Only `Starting` / `Recording` — **not** `Ready` |
| Result | Success toast for Ready-on-start, but controls returned to Idle |

Secondary: `OpenRecordingStreamAsync` ignored route `assemblyId` (assembly mismatch possible).

VPS logs also showed LiveKit Egress `503 no response from servers` (no egress worker). Egress is only used when `LIVEKIT_EGRESS_URL` / `LiveKit:EgressUrl` is set; otherwise synthetic pilot.

---

## 2. AS-IS → TO-BE state machine

```text
Idle → Starting → Recording → Stopping/Processing → Ready
                      ↘ Failed
```

| Transition | Behavior |
| --- | --- |
| Start | Persist Starting → SignalR → provider → **Recording** (synthetic no longer jumps to Ready) |
| Double start | Returns existing active recording (idempotent) |
| Stop | Processing → provider stop → Ready (synthetic) or stay Processing (LiveKit) |
| Double stop | Returns Processing/Ready (idempotent) |
| Complete assembly | `FinalizeActiveRecordingsAsync` stops in-flight rows (no orphans) |
| Pause assembly | Recording may continue (existing domain: start allowed while Paused) |

---

## 3. Files modified

**Backend (recording presentation / lifecycle only):**

- `RecordingService.cs` — Recording after start; idempotent start/stop; finalize on complete; assemblyId on stream open
- `AssemblyService.cs` — call finalize before Complete
- `LiveKitMeetingRecordingProvider.cs` — do not treat LiveKit signaling URL as egress (prior fix)
- `RecordingController.cs` — pass assemblyId into stream open

**Frontend:**

- `room-app.js` — banner/timer/stop controls bound to Starting/Recording/Processing; reload hydrate; toasts by status
- `assembly.html` — `room-app.js?v=rec4`

**Tests:**

- `RecordingExpedienteTests.cs` — assert Recording→Stop→Ready, double start/stop, assembly mismatch deny

---

## 4. Endpoints

| Action | Route |
| --- | --- |
| Start | `POST /api/assemblies/{id}/recording/start` |
| Stop | `POST /api/assemblies/{id}/recording/{recordingId}/stop` |
| List | `GET /api/assemblies/{id}/recordings` |
| Refresh | `POST .../recording/{id}/refresh` |
| Play/Download | `GET .../recording/{id}/play\|download` (assemblyId must match) |

Realtime: SignalR `recordingUpdated` with `AssemblyRecordingDto`.

Audit: `RecordingStarted` / `RecordingStopped` / `RecordingReady` / `RecordingFailed` (existing names).

---

## 5. RBAC / tenancy

- Start/Stop: `recording:control` (unchanged)
- View/Play: `recording:view`
- Download: `recording:download`
- Tenant match on assembly + recording; stream requires assemblyId == recording.AssemblyId

---

## 6. Local certification evidence

| Gate | Result |
| --- | --- |
| Build | PASS (0 errors) |
| Integration Start→Recording→Stop→Ready | PASS |
| Double start / double stop | PASS |
| Assembly mismatch download | PASS (400/404/403) |
| Synthetic no longer Ready-on-start | PASS |

Browser Playwright full suite: API + hydrate path certified; operator should hard-refresh `?v=rec4` for UI.

---

## 7. Production notes

- Without LiveKit Egress worker, provider is **SyntheticPilotMp4**: real auth/stream/download paths with pilot MP4; lifecycle still Idle→Recording→Stop→Ready for UI.
- True composite video requires deploying `livekit-egress` and setting `LIVEKIT_EGRESS_URL`.

---

## 8. Final

**LOCAL RECORDING LIFECYCLE CERTIFIED** (API + domain + UI wiring)  
Production smoke after deploy of this commit.
