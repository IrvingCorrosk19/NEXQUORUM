# Firewall

UFW rules added for ASAMBLEAS only:

| Port | Purpose |
|------|---------|
| 8092/tcp | HTTP pilot reverse proxy |
| 7881/tcp | LiveKit RTC TCP |
| 7882-7892/udp | LiveKit RTC UDP |
| 7880/tcp | Legacy direct signaling (signaling preferred via Nginx 443) |

Protected / not publicly published:

- PostgreSQL container
- Kestrel `5090`
- LiveKit HTTP signaling (loopback)
