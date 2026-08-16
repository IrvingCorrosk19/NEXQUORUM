# ASAMBLEAS — LiveKit Egress Infrastructure & Final Certification

**Date:** 2026-08-16  
**Commits:** `a4b1e8b` → `6e2e00a` → `78ab482`  
**Previous lifecycle:** `e1b8870` / `aa3c047` (PASS)  
**Prior egress audit:** `8e14b86` (NOT READY)

**Final status:** `NOT CERTIFIED` (RoomComposite Chrome does not produce a usable MP4 yet)

---

## Executive Summary

Infrastructure for real LiveKit Egress was provisioned on the VPS:

| Gate | Result |
| --- | --- |
| Redis | PASS (healthy) |
| `livekit/egress:v1.8.4` worker | PASS (service ready) |
| `LIVEKIT_EGRESS_URL` | CONFIGURED (`http://host.docker.internal:7880`) |
| Shared volume `/data/recordings` | PASS (web + egress) |
| Production synthetic fallback | DISABLED |
| Provider selection | `LiveKitEgress` (no Synthetic silent PASS) |
| Egress job accepted | PASS (`egress_id` returned) |
| RoomComposite → real MP4 | **FAIL** |

ASAMBLEAS correctly refuses Synthetic when Egress is configured. The remaining defect is **LiveKit RoomComposite Chrome WebRTC completion** (`EGRESS_STARTING` hang / prior `failed to change state to PLAYING` / `Start signal not received`), not the recording lifecycle state machine.

---

## Topology before → after

**Before**

- `asambleas_web` + `asambleas_postgres` + `asambleas_livekit` (bridge)
- No Redis, no egress worker
- `ASAMBLEAS_RECORDING_SYNTHETIC=true` → SyntheticPilotMp4

**After**

- `asambleas_redis` (bridge + `127.0.0.1:6379`)
- `asambleas_livekit` **host network** + Redis `127.0.0.1:6379`
- `asambleas_egress` **host network** + shared `asambleas_recordings` → `/data/recordings`
- `asambleas_web` → Twirp via `host.docker.internal:7880`
- Synthetic fallback **false** in production

Versions: LiveKit Server **v1.8.4**, Egress **v1.8.4**, Redis **7-alpine**.

---

## Provider policy

| Environment | Behavior |
| --- | --- |
| Prod (VPS) | `LIVEKIT_EGRESS_URL` set + `ASAMBLEAS_RECORDING_SYNTHETIC=false` → **LiveKitEgress only**; start fails loudly if provider errors |
| Dev/tests | May set `ASAMBLEAS_RECORDING_SYNTHETIC=true` for SyntheticPilotMp4 |

Evidence: production start returned `provider=LiveKitEgress` with real `ProviderEgressId` (e.g. `EG_TBfiYzEsPPpz`).

---

## Storage

- Volume: `asambleas_recordings`
- Path: `/data/recordings/{tenantId}/{assemblyId}/{recordingId}.mp4`
- App `Recording:StorageRoot` = `/data/recordings`
- Egress filepath root = `/data/recordings`
- Persistence: docker volume (survives container recreate)
- Permissions: egress UID `1001`; deploy should `chown 1001` / `chmod 2775` on volume
- Retention/cleanup automation: **not present** (future improvement; no deletes performed)

Disk observed: ~41–45 GiB free on `/` (VPS ~193 GiB).

---

## Real egress attempts (evidence)

1. Empty-room / API probes created egress IDs successfully.
2. Browser E2E (`tools/e2e/livekit-real-egress-cert.cjs`) against production:
   - `provider=LiveKitEgress`
   - `status=Recording` then stop → `Processing` → refresh `Failed`
   - Failure reason: `failed to change state to PLAYING`
3. Later host-network colocated LiveKit+Egress: jobs remain `EGRESS_STARTING` without Chrome `START_RECORDING` / without output file.

**READY = MEDIA AVAILABLE** hardening shipped in app (`MarkReadyAsync` + provider status require file on disk) — correct, but no real file was produced.

---

## Defects

| ID | Severity | Description |
| --- | --- | --- |
| EGRESS-RTC-1 | P0 for this gate | RoomComposite Chrome does not reach PLAYING / Start signal; no real MP4 written |
| DTO-1 | P3 | `AssemblyRecordingDto` does not expose `ProviderEgressId` to clients (DB has it) |

Application lifecycle / Synthetic false-PASS: **not** the issue.

---

## Fixes applied (infra + minimal app)

**Infra:** compose Redis + egress, shared volume, synthetic disabled, host networking for LiveKit+egress, deploy env sync.

**App (minimal, READY semantics):** require storage object before Ready (`RecordingService`, `LiveKitMeetingRecordingProvider`).

**CODE CHANGES:** YES (infra + READY guard)  
**BUILD:** PASS (prior)  
**Deploy:** PASS (containers healthy)

---

## What remains for FULL certification

1. Stabilize RoomComposite WebRTC path until egress reaches `EGRESS_ACTIVE` / `EGRESS_COMPLETE` with `size > 0`.
2. Re-run browser camera/mic/screen-share E2E + ffprobe + Expediente play/download.
3. Only then declare `ASAMBLEAS RECORDING — FULLY PRODUCTION CERTIFIED`.

Do **not** re-enable Synthetic in production to fake this gate.

---

## Assembly final state

Demo Ocean Tower left `InProgress`. Stuck egress jobs stopped when possible. Active orphan egress target: cleaned best-effort after probes.

---

## Final

`NOT CERTIFIED`
