# Nginx

Site file: `/etc/nginx/sites-available/asambleas.conf` (symlink in `sites-enabled`).

## Features

- HTTP pilot on port `8092` (IP)
- HTTPS on `asambleas.164.68.99.83.nip.io` and `livekit-asambleas.164.68.99.83.nip.io`
- HTTP → HTTPS redirect for nip.io hostnames
- WebSocket upgrade for `/hubs/` (SignalR)
- Forwarded headers (`X-Forwarded-For`, `X-Forwarded-Proto`)
- Long proxy timeouts for realtime
- Enlarged proxy buffers (`proxy_buffer_size` / `proxy_buffers`) required because Identity auth cookies + permission claims exceed nginx defaults (~4–5KB Set-Cookie)

## Upstream

- App: `127.0.0.1:5090`
- LiveKit signaling: `127.0.0.1:7880`
