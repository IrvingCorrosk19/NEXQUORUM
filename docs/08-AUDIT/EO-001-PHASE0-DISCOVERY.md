# EO-001 — PHASE 0: Workspace & Environment Discovery

**Date:** 2026-08-08  
**Execution Order:** EO-001  
**Status:** COMPLETED

---

## 1. Structure Found (AS-IS)

| Path | Status |
|------|--------|
| Workspace root `c:\Proyectos\NEXQUORUM` | Nearly empty |
| `PH GOVERNANCE & ASSEMBLY INTELLIGENCE PLATFORM.txt` | Planning document only (~2.5k lines) |
| `src/`, `tests/`, solution files | **ABSENT** (greenfield) |
| Git repository | **ABSENT** at discovery → initialized during Phase 0 |
| Existing appsettings / secrets | **ABSENT** |

**Verdict:** GREENFIELD. No prior application code.

---

## 2. SDK .NET Installed

| Item | Value |
|------|-------|
| Pre-discovery SDKs | 9.0.306 only |
| Runtimes present | ASP.NET Core 8.0.21, 9.0.10 |
| Required by EO-001 | **.NET 10 LTS** |
| Action | Installing `Microsoft.DotNet.SDK.10` (10.0.302) via winget |

---

## 3. PostgreSQL Availability

| Item | Value |
|------|-------|
| Service | `postgresql-x64-18` — **Running** |
| Version | PostgreSQL 18.0 |
| Port | localhost:5432 — accepting connections |
| Auth | scram-sha-256 (local + TCP) |
| Credentials | **UNKNOWN** — password auth failed for common defaults |
| `pgpass` | Not found |
| Docker engine | Installed (28.5.1) but was not running at discovery; Docker Desktop started |

**Mitigation:** Provide `docker-compose.yml` with dedicated Postgres 18 + known **non-secret** local demo credentials documented for Development only. Prefer Docker Postgres for EO-001 reproducibility. Local Windows PG 18 remains usable if developer supplies connection string via User Secrets / env.

---

## 4. Git Status

- Repository initialized in Phase 0.
- No commits yet.
- `.gitignore` to be added before first meaningful commit.

---

## 5. Existing Configuration

- No `appsettings*.json` application config.
- LiveKit env vars: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — **NOT SET**.
- Connection string env — **NOT SET**.

---

## 6. Risks Found

| Risk | Severity | Mitigation |
|------|----------|------------|
| .NET 10 not yet on PATH until install finishes | High | Await install; refresh PATH |
| Local PG password unknown | High | Docker Compose Postgres for EO-001 |
| LiveKit credentials absent | Medium | Implement provider + tokens; mark AV tests BLOCKED |
| Docker Desktop cold start | Medium | Wait / fallback document BLOCKED for container PG |
| Scope vs time (EO-001 is large) | Medium | Vertical slice first; no feature theater |
| Node/npm present (useful for Playwright) | Low | Use for E2E |

---

## 7. Proposed Solution Structure

```text
src/
  Asambleas.Web              # ASP.NET Core host, Razor/HTML UI, SignalR hubs, APIs
  Asambleas.Application      # Use cases, ports, permissions orchestration
  Asambleas.Domain           # Entities, value objects, domain services, invariants
  Asambleas.Infrastructure   # EF Core, PostgreSQL, LiveKit, Identity, seed
  Asambleas.Contracts        # Shared DTOs / events / API contracts
  Asambleas.Workers          # Background jobs (minimal for EO-001)

tests/
  Asambleas.UnitTests
  Asambleas.IntegrationTests
  Asambleas.ArchitectureTests
  Asambleas.SecurityTests
  Asambleas.E2ETests         # Playwright
```

Modules (boundaries inside Application/Domain): Identity, Tenancy, PropertyHorizontal, Ownership, Assembly, Attendance, Quorum, Agenda, Motion, Voting, Meeting, Audit.

---

## 8. ADRs to Create

1. ADR-001 Modular Monolith  
2. ADR-002 Multitenancy  
3. ADR-003 PostgreSQL  
4. ADR-004 Realtime SignalR  
5. ADR-005 Meeting Provider (LiveKit)  
6. ADR-006 Voting Integrity  
7. ADR-007 Audit  

---

## 9. Exact EO-001 Plan

1. Foundation: solution, gitignore, DI, health, observability  
2. Domain model + EF mappings + migration review → migrate  
3. Auth (cookie) + roles/permissions + `ICurrentTenant`  
4. Demo seed (PH Ocean Tower, 8 users, assembly)  
5. Check-in, attendance, quorum engines  
6. SignalR hub + assembly room UI (design system)  
7. Agenda, speaker queue, motion, voting + decision rule  
8. `IMeetingProvider` + LiveKit implementation (credentials optional)  
9. Audit trail  
10. Unit / Integration / Security / Architecture / E2E tests  
11. Gates + `EO-001-COMPLETION-REPORT.md`

---

## 10. External Blockers

| Blocker | Impact | Status label |
|---------|--------|--------------|
| LiveKit credentials | Real AV room tokens | `BLOCKED — LIVEKIT CREDENTIALS REQUIRED` |
| Local PG password (if not using Docker) | Migrations / integration | Use Docker Compose OR supply `ConnectionStrings__Default` |
| Docker engine readiness | Compose Postgres | Pending cold start |

**Required LiveKit variables (developer):**

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

Optional:

```text
LIVEKIT_DEFAULT_ROOM_PREFIX
```
