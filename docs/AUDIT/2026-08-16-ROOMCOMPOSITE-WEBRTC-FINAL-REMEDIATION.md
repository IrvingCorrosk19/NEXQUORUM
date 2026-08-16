# ASAMBLEAS — RoomComposite WebRTC Final Remediation

**Date:** 2026-08-16  
**Host:** `164.68.99.83` · `https://asambleas.164.68.99.83.nip.io`  
**Synthetic fallback:** `ASAMBLEAS_RECORDING_SYNTHETIC=false` (unchanged)  
**Verdict:** `ASAMBLEAS RECORDING — FULLY PRODUCTION CERTIFIED`

---

## ROOT CAUSE

**Classification: Template Start-signal gate (official RoomComposite behavior) — not ICE/hairpin/Chrome crash.**

Official LiveKit RoomComposite template calls `EgressHelper.startRecording()` only after a **remote track is subscribed** (`TrackSubscribed` / existing remote tracks).  

Empty-room / no-publisher probes therefore:

1. Accept `egress_id` (control plane OK)
2. Launch Chrome and join the room (WebRTC/ICE OK — participant active)
3. **Never emit START_RECORDING**
4. Abort with `Start signal not received`  
   or race into GStreamer `failed to change state to PLAYING`

**Evidence that media plane was already healthy once a publisher existed:**

| Probe | Result |
|---|---|
| Empty assembly room (prior) | `EGRESS_ABORTED` / `Start signal not received` |
| Direct room + `lk room join --publish-demo` | `EGRESS_ACTIVE` → file growth → `EGRESS_COMPLETE` |
| ASAMBLEAS API with camera+mic publishers in room | `Ready` MP4 8.9 MB · play/download 200 |
| Screen-share source track | `source: SCREEN_SHARE` · `EGRESS_ACTIVE` · ffprobe H264 |

ICE selected reachable local/public candidates (`udp` / host network). Chrome ran with image defaults (`--no-sandbox` supplied by official egress image). `/dev/shm` = 1 GiB.

**Not the primary blocker:** hairpin NAT, TLS trust, Redis auth, API key mismatch, insufficient shm, Chrome sandbox, version skew.

---

## Topology

```
Internet
  └─ nginx (TLS) → asambleas_web (bridge asambleas_net, 127.0.0.1:5090→8080)
                     ├─ LIVEKIT_URL=wss://livekit-asambleas.…nip.io  (browser media)
                     └─ LIVEKIT_EGRESS_URL=http://host.docker.internal:7880  (control)

Host network namespace:
  ├─ asambleas_livekit  (host)  :7880 API/WS · :7881 RTC TCP · UDP 7882–7892
  ├─ asambleas_egress   (host)  ws_url=ws://127.0.0.1:7880 · health :9092 · shm 1g
  └─ redis published 127.0.0.1:6379 (container still on bridge)

Shared volume: asambleas_recordings → /data/recordings (web + egress)
```

| Service | Network | Role |
|---|---|---|
| `asambleas_web` | bridge + `extra_hosts: host-gateway` | App / control to LiveKit API |
| `asambleas_postgres` | bridge | DB |
| `asambleas_redis` | bridge · host port 6379 | Egress job bus |
| `asambleas_livekit` | **host** | Signaling + media |
| `asambleas_egress` | **host** | Chrome RoomComposite → MP4 |

Public IP: `164.68.99.83` · LiveKit `use_external_ip: true`

---

## Ports / firewall

| Port | Purpose | UFW |
|---|---|---|
| 7880/tcp | LiveKit API / WS | ALLOW |
| 7881/tcp | RTC TCP | ALLOW |
| 7882–7892/udp | RTC UDP | ALLOW |
| 9092/tcp | Egress health (host) | local |

Verified via `ss` / `ufw status`.

---

## ICE analysis

With host-network LiveKit + Egress, Chrome recorder becomes LiveKit participant `EG_*` with `connectionType: udp` and selected candidates including host `164.68.99.83` / local bridge gateways.  

Empty-room failures still showed **participant active** — proving ICE was not the PLAYING blocker.

---

## Chrome analysis

- Process starts under egress handler (`google-chrome` 125.x)
- Official image flags include `--no-sandbox` / `--disable-dev-shm-usage`
- `shm_size: 1gb` (1073741824 bytes)
- No DevToolsActivePort / SIGTRAP / renderer crash loops observed on successful jobs
- Template base: egress internal `http://localhost:7980/`

---

## Config (secrets redacted)

**livekit.yaml:** port 7880 · rtc tcp 7881 · udp 7882–7892 · `use_external_ip: true` · redis `127.0.0.1:6379`

**egress.yaml:** `ws_url: ws://127.0.0.1:7880` · `insecure: true` · redis `127.0.0.1:6379` · `health_port: 9092` · `log_level: info`

**App env:** `ASAMBLEAS_RECORDING_SYNTHETIC=false` · `Recording__AllowSyntheticFallback=false` · `LIVEKIT_EGRESS_URL=http://host.docker.internal:7880`

---

## Version compatibility

| Component | Version |
|---|---|
| LiveKit Server | **1.8.4** |
| livekit/egress | **v1.8.4** |
| Redis | 7-alpine |

Matched pair; no upgrade required for this remediation.

---

## Direct Egress test (Phase A)

- Room: `rc-webrtc-probe-1786890561`
- Publisher: `lk room join --publish-demo`
- Egress: `EG_LZA9vZSw4RcQ`
- Lifecycle: `STARTING` → **`ACTIVE` (PLAYING)** → file writing → `COMPLETE`
- Output: `/data/recordings/_probe/rc-webrtc-probe-1786890561.mp4` (~16 MB)
- ffprobe: duration **43.91 s** · **H264 1280×720 @30fps** · **AAC stereo**

---

## PLAYING / FILE WRITING evidence

| Egress ID | Room | Status |
|---|---|---|
| `EG_LZA9vZSw4RcQ` | rc-webrtc-probe-… | ACTIVE → COMPLETE |
| `EG_7FAfetvYSYqu` | assembly-4444…401 | COMPLETE (ASAMBLEAS) |
| `EG_f8aqCmg75MLc` | rc-ss-probe-… | ACTIVE → COMPLETE (screen share) |

---

## ASAMBLEAS E2E

- Assembly: `44444444-4444-4444-4444-444444444401`
- Publishers in room before start: camera (`--publish-demo`) + mic (`tone.ogg`)
- Recording: `68bcaa32-0dc5-441b-a984-25b0774325bb`
- Provider: **LiveKitEgress** (not Synthetic)
- Status: Recording → Processing → **Ready** (`fileSizeBytes=8926211`)
- Play: **200** `video/mp4`
- Download: **200** · 8926211 bytes
- Expediente screenshot: `tools/e2e/livekit-egress-results/04-expediente.png`
- Results: `tools/e2e/livekit-egress-results/results.json`

ffprobe (production object):

- Duration **23.82 s**
- Video **H264 1280×720**
- Audio **AAC 127 kb/s** (real mic tone present)

---

## Screen share (Phase D)

- Track published with `source: SCREEN_SHARE` (LiveKit log `mediaTrack published` · name `screen`)
- Egress `EG_f8aqCmg75MLc` → ACTIVE → COMPLETE
- ffprobe: H264 1280×720 · duration 13.21 s

---

## Multi participant

During ASAMBLEAS certification room listing showed **2 participants / 2 publishers** (`asam-pub-cam`, `asam-pub-mic`) plus president browser join — composite captured A/V successfully.

---

## Security

| Check | Result |
|---|---|
| President play Ready MP4 | 200 |
| Owner `owner101@ocean.demo` play | 200 |
| Unauthenticated play | **401** |
| Double start idempotent | same `recordingId` |
| Synthetic | DISABLED |

---

## Close safety / orphans

After all probes and ASAMBLEAS stop/refresh:

```
ACTIVE_ORPHAN_EGRESS = 0
```

Egress health remained ready (`{"CpuLoad":…}` on `:9092`).  
Lifecycle `FinalizeActiveRecordingsAsync` / Ready-requires-file guards left intact (no regression).

---

## Resource usage

Spot `docker stats` during ACTIVE RoomComposite: egress CPU elevated (Chrome + encode), web/livekit stable. No premature tuning.

---

## Application code changes

**NONE.** Wiring already selected `LiveKitEgress` when egress URL configured. Failures were empty-room media preconditions, not app bugs.

**Operational requirement (documented, not coded):** start RoomComposite only when at least one remote A/V track is published (camera/mic/screen). Otherwise official template will not reach PLAYING.

---

## Infra changes (this remediation session)

No new compose topology change required beyond prior host-network LiveKit+Egress deploy.  

Transient: egress `log_level: debug` during diagnosis → restored to **`info`** on VPS (matches repo `deploy/vps/egress.yaml`).

Probe artifacts under `/data/recordings/_probe/` are test-only.

---

## Commits / deploy

| Item | Status |
|---|---|
| App build | **NOT REQUIRED** |
| Deploy | **NOT REQUIRED** (infra already live; certified in place) |
| Push | Not requested in this session |
| Audit commit | See git history after commit of this document |

---

## Definition of Done checklist

| Gate | Status |
|---|---|
| RoomComposite PLAYING | PASS |
| Real WebRTC media | PASS |
| Real MP4 | PASS |
| Video | PASS |
| Audio | PASS |
| Screen share | PASS |
| Multi participant | PASS |
| Expediente play/download | PASS |
| Zero orphan ACTIVE egress | PASS |
| Synthetic disabled | PASS |

**FINAL:** `ASAMBLEAS RECORDING — FULLY PRODUCTION CERTIFIED`
