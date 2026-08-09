# ASAMBLEAS — Multi-Participant Video Certification

**Date:** 2026-08-09  
**Environment:** `https://asambleas.164.68.99.83.nip.io/`  
**LiveKit:** `wss://livekit-asambleas.164.68.99.83.nip.io`  
**Evidence:** `artifacts/vps/evidence-multiparty-video/`  
**Harness:** `artifacts/vps/cert-multiparty-video.mjs`  
**Human checklist:** `docs/TESTING/EO-009-8-PERSON-HUMAN-AV-PILOT.md`

## Runtime proof (automated)

Two Playwright browser contexts (president + secretary) with fake media devices:

- Local tile with mirrored video + LiveKit publish
- Remote tile subscribed with `<video srcObject>` on both sides
- Pair grid (`is-pair`), camera off → avatar, mic mute, focus view
- Leave A/V keeps agenda/quorum DOM

| Check | Result |
|-------|--------|
| LIVEKIT SERVER | PASS |
| TOKEN GENERATION | PASS (`canPublish=true` for president + secretary + owner101 via API) |
| ROOM ISOLATION | PASS (`assembly-{assemblyId:N}` shared only within assembly) |
| LOCAL VIDEO | PASS |
| REMOTE VIDEO | PASS (A sees B, B sees A) |
| REMOTE AUDIO | PASS (remote `<audio>` elements subscribed; physical hear = human pilot) |
| 2 PARTICIPANTS | PASS |
| 4 PARTICIPANTS | PASS (4 contexts, 4 `has-video` tiles, `is-quad`) |
| 8 PARTICIPANT LAYOUT | MANUAL ACCEPTANCE REQUIRED (CSS `is-oct` ready) |
| ACTIVE SPEAKER | MANUAL ACCEPTANCE REQUIRED (wired via `ActiveSpeakersChanged`) |
| GOVERNANCE SPEAKER | MANUAL ACCEPTANCE REQUIRED (PALABRA + focus; not LiveKit publish gate) |
| CAMERA ON/OFF | PASS |
| MIC ON/OFF | PASS |
| JOIN/LEAVE | PASS |
| RECONNECT | MANUAL ACCEPTANCE REQUIRED |
| TENANT ISOLATION | PASS |
| ASSEMBLY ISOLATION | PASS (room name scoped to assembly id) |
| MOBILE | MANUAL ACCEPTANCE REQUIRED (responsive CSS + filmstrip rules present) |
| HTTPS | PASS |
| TURN | NOT REQUIRED IN TEST ENVIRONMENT (same-host contexts); configure before cross-NAT pilot if ICE fails |
| VPS | PASS |
| HUMAN A/V PILOT | MANUAL ACCEPTANCE REQUIRED |

## Policy notes

- **Media publish:** all registered join participants receive `canPublish=true`.
- **Governance floor:** visual priority / queue only — does **not** mute other participants.
- **Counts:** LiveKit media connected ≠ SignalR presence ≠ accredited owners (operator cockpit labels them separately).

## P0 OPEN

- None blocking 2-party real media on VPS HTTPS.

## P1 OPEN

- Human 8-person A/V pilot on mixed networks
- TURN if restrictive NATs fail ICE
- 8 automated layout evidence beyond CSS readiness
- Physical active-speaker / granted-floor UX validation

## FINAL VERDICT

**READY FOR 8-PERSON PILOT** (automated remote video proven for 2; human A/V checklist required for physical audio/video PASS).
