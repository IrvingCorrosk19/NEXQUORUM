# LiveKit self-hosted

## Decision

EO-009 is implemented (`IMeetingProvider`, join-token API, lobby/assembly UI). Self-hosted LiveKit **deployed**.

## Stack

- Image: `livekit/livekit-server:v1.8.4`
- Config: `/opt/apps/asambleas/deploy/vps/livekit.yaml` (keys injected on server)
- Signaling: loopback `7880` → Nginx WSS `livekit-asambleas.164.68.99.83.nip.io`
- RTC: TCP `7881`, UDP `7882-7892` on host
- `rtc.use_external_ip: true`

## App config (server `.env`)

- `LIVEKIT_URL`: `wss://livekit-asambleas.164.68.99.83.nip.io`
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`: CONFIGURED

## Token API

`POST /api/assemblies/{id}/meeting/join-token`

Returns: `serverUrl`, short-lived `token`, `roomName`, `canPublish`, etc.

**Never** returns API secret (verified).

## TURN

Dedicated TURN not configured for this pilot. Restrictive NATs may fail media; document as known limitation.

## Human A/V

Camera/microphone physical validation: **MANUAL ACCEPTANCE REQUIRED**.
