# EO-009 — 8 Person Human A/V Pilot Checklist

**Status:** MANUAL ACCEPTANCE REQUIRED  
**Scope:** Real cameras/microphones on real devices. Automated Playwright with fake devices does **not** mark this PASS.

## Environment

- URL: `https://asambleas.164.68.99.83.nip.io/`
- LiveKit: `wss://livekit-asambleas.164.68.99.83.nip.io`
- Ideal: laptop + phone on **different networks** for at least 2 of 8 participants

## Per participant (×8)

| # | Check | Pass? |
|---|-------|-------|
| 1 | Join via lobby (pre-join preview) | |
| 2 | Camera on — others see my video | |
| 3 | Microphone on — others hear me | |
| 4 | See remote videos in grid (not presence chips only) | |
| 5 | Hear active / governance speaker | |
| 6 | Mute / unmute local mic | |
| 7 | Camera off → avatar/initials (no black tile) | |
| 8 | Camera on again | |
| 9 | Request speak | |
| 10 | (Operator) Grant speak → PALABRA highlight / focus | |
| 11 | Vote while media connected | |
| 12 | Brief network drop → Reconectando… then recover | |
| 13 | Leave A/V without breaking agenda/quorum | |
| 14 | Full leave room | |

## Cross-checks

| Check | Pass? |
|-------|-------|
| 2 browsers same assembly: A sees B and B sees A | |
| Tenant isolation: wrong-tenant assembly rejected | |
| Different assemblies do not share LiveKit room | |
| HTTPS secure context for getUserMedia | |

Do **not** mark HUMAN A/V PILOT as PASS until executed with real hardware.
