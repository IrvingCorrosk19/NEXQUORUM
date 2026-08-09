# SignalR

## Path

`/hubs/assembly`

## Nginx

`Upgrade` + `Connection` headers, buffering off, long timeouts.

## Evidence (VPS)

- Negotiate HTTP 200 with `WebSockets` transport listed
- Distinct `connectionId` across negotiate calls
- Browser assembly room shows **Conectado** without manual refresh

## Reconnect

Logout → `/api/auth/me` 401 → login again → 200 verified via HTTPS API.
Full browser network drop/reconnect of the hub is **MANUAL ACCEPTANCE REQUIRED** for field networks.
