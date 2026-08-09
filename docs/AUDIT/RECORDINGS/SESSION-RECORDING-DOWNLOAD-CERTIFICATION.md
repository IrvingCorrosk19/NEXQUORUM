# ASAMBLEAS — SESSION RECORDING & DOWNLOAD CERTIFICATION

**Date:** 2026-08-09  
**Evidence:** integration `RecordingExpedienteTests` PASS; VPS deploy with volume `asambleas_recordings`

## Scorecard

| Item | Result |
|------|--------|
| LIVEKIT RECORDING | PARTIAL (egress client implemented; VPS pilot uses synthetic fallback until egress container is fully wired) |
| RECORDING START | PASS |
| RECORDING STOP | PASS |
| RECORDING NOTICE | PASS (policy + ack API + UI) |
| PROCESSING | PASS |
| STORAGE | PASS (local volume / abstraction) |
| PLAYBACK | PASS (authorized `/play` + range) |
| STREAMING | PASS |
| DOWNLOAD VIDEO | PASS (real bytes + SHA-256) |
| DOWNLOAD ACTA/ATTENDANCE/QUORUM/VOTING/DECISIONS | PASS (via ZIP package texts/PDFs) |
| EVIDENCE PACKAGE | PASS |
| ZIP VALIDATION | PASS (manifest present, no mp4 inside) |
| MANIFEST / CHECKSUM | PASS |
| SECRET VOTE PROTECTION | PASS (aggregates only) |
| RBAC / MULTITENANT / IDOR | PASS (auth required; tenant match) |
| AUDIT | PASS |
| MOBILE | PASS (expediente responsive + size labels) |
| BROWSER E2E | PARTIAL (API+integration certified; UI pages shipped) |
| VPS | PASS (deploy + health) |

## P0 OPEN

- Full LiveKit Egress container + Redis on VPS for production-grade A/V capture (client ready)

## P1 OPEN

- Automatic retention worker
- S3 storage backend

## FINAL VERDICT

**CERTIFIED (CONDITIONAL)** — Download/play/expediente/security certified. Live media capture on VPS remains conditional on enabling LiveKit Egress; pilot uses explicit `SyntheticPilotMp4` provider when egress is unavailable.
