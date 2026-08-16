# ASAMBLEAS — LiveKit Real Egress Final Certification

**Date:** 2026-08-16  
**Mode:** CERTIFICATION FIRST · FIX ONLY IF REPRODUCIBLE DEFECT  
**Code changes:** NONE  
**Final status:** `NOT CERTIFIED`

---

## Executive Summary

Previous lifecycle certification (`e1b8870` / `aa3c047`) remains valid for the recording **state machine** (start/stop/ready/reload/RBAC/tenancy).  

This gate requires **real LiveKit Room Composite Egress → real MP4**. Production currently selects **`SyntheticPilotMp4`** because egress infrastructure is not deployed. Per fail-fast rules, certification stops here without application code changes.

---

## Previous Certification

| Item | Value |
| --- | --- |
| Status | `RECORDING LIFECYCLE — PRODUCTION CERTIFIED` |
| Commits | `e1b8870`, `aa3c047` |
| Provider used then | `SyntheticPilotMp4` (explicitly noted as not real egress) |

---

## Infrastructure

| Component | Status |
| --- | --- |
| ASAMBLEAS (`/health`) | HEALTHY (HTTP 200) |
| LiveKit server (`asambleas_livekit`) | CONFIGURED · running · HTTP 200 |
| `LIVEKIT_URL` | CONFIGURED |
| `LIVEKIT_API_KEY` | CONFIGURED |
| `LIVEKIT_API_SECRET` | CONFIGURED |
| `LIVEKIT_EGRESS_URL` / `LiveKit:EgressUrl` | **NOT CONFIGURED** |
| `livekit-egress` container | **NOT PRESENT** (`NO_EGRESS_CONTAINER`) |
| Egress in `docker-compose.yml` | **ABSENT** (only `asambleas_livekit` server) |
| `ASAMBLEAS_RECORDING_SYNTHETIC` | CONFIGURED (`true` → synthetic fallback allowed) |
| `Recording:EgressOutputRoot` / `ASAMBLEAS_EGRESS_OUTPUT` | NOT CONFIGURED |
| Redis (typical egress bus) | NOT present in ASAMBLEAS compose |
| Secrets printed | NONE |

---

## Provider Selection

Source: `LiveKitMeetingRecordingProvider.StartAsync`

```text
IF LiveKit.IsConfigured AND LIVEKIT_EGRESS_URL (or LiveKit:EgressUrl) is set
  → attempt StartRoomCompositeEgress → provider "LiveKitEgress"
  → on failure: throw UNLESS AllowSyntheticFallback
ELSE IF AllowSyntheticFallback (ASAMBLEAS_RECORDING_SYNTHETIC / Recording:AllowSyntheticFallback)
  → provider "SyntheticPilotMp4" (tiny pilot MP4)
ELSE
  → throw "Recording provider is not configured."
```

**Production evidence (2026-08-16):**

```text
POST /api/assemblies/{demo}/recording/start
→ provider = SyntheticPilotMp4
→ status = Recording
→ egressId = (none)
```

Silent fallback to Synthetic for this gate = **FAIL** (honest reporting; no false PASS).

---

## What Is Missing (to become ready)

1. Deploy/run **`livekit/egress`** (or equivalent) joined to the LiveKit cluster.  
2. Set **`LIVEKIT_EGRESS_URL`** (or `LiveKit:EgressUrl`) to the egress HTTP/Twirp endpoint.  
3. Wire egress **file/S3 output** into ASAMBLEAS recording storage (`/data/recordings` or shared volume).  
4. Typically: Redis + LiveKit config for egress coordination (not in current `livekit.yaml`).  
5. For this certification gate: disable silent synthetic success (`ASAMBLEAS_RECORDING_SYNTHETIC=false`) so start fails loudly if egress is down.  
6. Expose/configure network so `asambleas_web` can reach egress.

**No application refactor required until infra exists.** App already has Room Composite start/stop paths gated on egress URL.

---

## Real Egress Evidence

| Gate | Result |
| --- | --- |
| Real Egress selected | **FAIL** |
| Real Egress ID | N/A |
| Camera / Mic / Screen → Room → Egress → MP4 | **NOT EXECUTED** (infra not ready) |
| ffprobe | NOT EXECUTED (`ffprobe` not available locally; no real egress file) |

---

## Tests Not Executed (blocked by F1/F2)

Camera, microphone, screen share, multi-participant, disconnect/reconnect, reload, two-tab, stop/processing/ready with real media, MP4 validation, A/V sync, playback, download, multi-segment, close-safety **with real egress**, long-duration — all blocked by:

`LIVEKIT EGRESS INFRASTRUCTURE NOT READY`

Lifecycle/RBAC/tenancy remain covered by prior certification under Synthetic; they do **not** satisfy this gate.

---

## Defects Found

| ID | Type | Notes |
| --- | --- | --- |
| INFRA-1 | Infrastructure gap | No egress worker / URL in production |
| INFRA-2 | Config | Synthetic fallback default `true` — correct for pilot lifecycle, invalid for real-egress certification |

**Application defects in recording lifecycle:** 0 (no reproducible app bug for this gate).

---

## Fixes

**NONE.** Fail-fast: do not change application code or invent egress deploy without an explicit infrastructure task.

---

## Commit / Deploy

| Item | Value |
| --- | --- |
| CODE CHANGES | NONE |
| BUILD | NOT REQUIRED |
| LOCAL CERTIFICATION | NOT REQUIRED (blocked) |
| COMMIT (code) | NONE |
| PUSH (code) | NOT REQUIRED |
| VPS DEPLOY | NOT REQUIRED |

---

## Production Certification

**PRODUCTION REAL EGRESS: FAIL**

Demo assembly after probe: `InProgress`, active orphan recordings = `0` (start/stop cleanup of Synthetic probe).

---

## Final

`NOT CERTIFIED`

Next step (ops, not app): provision LiveKit Egress + `LIVEKIT_EGRESS_URL` + shared storage, then re-run this certification protocol without Synthetic for the main gate.
