# Known limitations

1. **Demo credentials on pilot** — `Demo:SeedUsers` enabled for controlled pilot; rotate/disable before broader production.
2. **Identity cookie size** — large permission claims require elevated Nginx proxy buffers.
3. **nip.io hostnames** — fine for pilot; prefer dedicated DNS for long-term branding/ops.
4. **No dedicated TURN** — some corporate/mobile NATs may block WebRTC media.
5. **Human A/V** — not certified without physical devices on both sides.
6. **OTHERPH demo users** — isolation tenant exists with assembly row; interactive other-tenant login users are not seeded (OCEAN users only).
7. **UTF-8 em-dash** display glitch in some titles (`â€"`) — cosmetic, not deploy-blocking.
8. **Disk ~81%** — monitor backup retention.
9. **Pilot scale** — certified for ~8 participants path, not 300 concurrent media sessions.
