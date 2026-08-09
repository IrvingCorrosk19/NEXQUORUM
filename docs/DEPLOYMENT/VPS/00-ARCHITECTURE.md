# ASAMBLEAS — VPS Architecture

## Pattern

Dedicated Docker Compose stack under `/opt/apps/asambleas`, consistent with other apps on this VPS (`/opt/apps/*`).

| Component | Role |
|-----------|------|
| `asambleas_web` | ASP.NET Core (Kestrel) on `127.0.0.1:5090` |
| `asambleas_postgres` | PostgreSQL 16 (Docker network only) |
| `asambleas_livekit` | LiveKit SFU self-hosted |
| Nginx | TLS termination + reverse proxy + WebSocket upgrade |
| systemd `asambleas.service` | Enables/starts compose stack on boot |

## Trust boundaries

- PostgreSQL: not published to the host/public internet.
- Kestrel: loopback only; browsers never hit it directly.
- LiveKit signaling: loopback `7880`, exposed to clients via Nginx WSS.
- LiveKit RTC: host TCP `7881` + UDP `7882-7892`.
- Secrets: `/opt/apps/asambleas/deploy/vps/.env` (mode `600`) — never Git.

## Public entry

- HTTPS app: `https://asambleas.164.68.99.83.nip.io/`
- HTTPS LiveKit: `https://livekit-asambleas.164.68.99.83.nip.io/` (WSS)
- HTTP pilot by IP port: `http://164.68.99.83:8092/` (compat with other preview ports)

## Credentials status (documentation only)

- SSH credentials: CONFIGURED
- Database credentials: CONFIGURED
- LiveKit credentials: CONFIGURED
