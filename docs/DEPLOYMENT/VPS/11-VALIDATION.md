# Validation evidence

| Check | Result |
|-------|--------|
| Release build | PASS (0 errors) |
| Unit/integration pre-deploy | PASS (local gate) |
| Containers up | PASS (`web`, `postgres`, `livekit`) |
| systemd enable/active | PASS |
| `/health` + `/health/ready` | PASS |
| Migrations | PASS (3) |
| Demo seed users | PASS (8) |
| Nginx + HTTPS | PASS |
| Login API HTTPS | PASS |
| Assemblies list/detail | PASS |
| SignalR negotiate + WS listed | PASS |
| Browser room "Conectado" | PASS |
| LiveKit join-token | PASS |
| Token secret exposure | PASS (none) |
| Tenant data (OCEAN + OTHERPH) | PASS (DB); list isolation for OCEAN user PASS |
| Backup + restore smoke | PASS |
| App restart recovery | PASS |
| Mobile UA / narrow viewport | PASS (page loads) |
| Human camera/microphone | MANUAL ACCEPTANCE REQUIRED |
| External mobile network WebRTC | MANUAL ACCEPTANCE REQUIRED |
| Full 8-person media drill | MANUAL ACCEPTANCE REQUIRED |
