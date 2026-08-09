# Demo Users (piloto / Development)

Passwords are **never** documented in Git or URLs.

| Item | Value |
|------|--------|
| Password source | `Demo:Password` / `ASAMBLEAS_DEMO_PASSWORD` / VPS `.env` `DEMO_PASSWORD` |
| Previously exposed password | **REVOKED** — must not authenticate |
| Public metadata (no passwords) | `GET /api/demo/users` |

Assembly: `44444444-4444-4444-4444-444444444401` (PH DEMO OCEAN TOWER)  
Tenant: OCEAN (`11111111-1111-1111-1111-111111111101`)

| # | Username | Email | Role | Own unit | Also represents (Approved power) | Effective if accredited |
|---|----------|-------|------|----------|----------------------------------|-------------------------|
| 1 | president | president@ocean.demo | AssemblyPresident | — (operator) | — | 0% |
| 2 | secretary | secretary@ocean.demo | AssemblySecretary | — (operator) | — | 0% |
| 3 | owner101 | owner101@ocean.demo | Owner | 101 (14%) | — | 14% |
| 4 | owner102 | owner102@ocean.demo | Owner | 102 (14%) | **107 (8%)** via power | **22%** |
| 5 | owner103 | owner103@ocean.demo | Owner | 103 (14%) | — | 14% |
| 6 | owner104 | owner104@ocean.demo | Owner | 104 (14%) | — | 14% |
| 7 | owner105 | owner105@ocean.demo | Owner | 105 (14%) | **108 (8%)** via power | **22%** |
| 8 | owner106 | owner106@ocean.demo | Owner | 106 (14%) | — | 14% |

Units 107/108 belong to absentee owners (no login). Quorum threshold: **50%**.

Check-in: `/checkin.html?assemblyId=44444444-4444-4444-4444-444444444401`

**Security:** never open `/?email=…&password=…`. Login is HTTPS + POST body only.
