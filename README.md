# ASAMBLEAS

**PH Governance & Assembly Intelligence Platform** — EO-001: Enterprise Foundation + Virtual Assembly POC (8 participants).

## Stack

- .NET 10 / ASP.NET Core 10
- PostgreSQL 18 + EF Core 10
- SignalR realtime
- HTML5 + CSS design system + ES modules
- LiveKit via `IMeetingProvider` (optional credentials)

## Requirements

- .NET SDK 10+
- PostgreSQL 18 (local or Docker Compose on port **5433**)
- Optional: LiveKit Cloud/self-hosted for real A/V

## Quick start

```powershell
# Option A — Docker Postgres for ASAMBLEAS (port 5433)
docker compose up -d
.\scripts\run-dev.ps1

# Option B — existing local PostgreSQL 18
$env:PGPASSWORD = "<your-local-password>"
.\scripts\run-dev.ps1
# or:
.\scripts\run-dev.ps1 -ConnectionString "Host=127.0.0.1;Port=5432;Database=asambleas;Username=postgres;Password=..."
```

App URLs (default):

- https://localhost:7188
- http://localhost:5188
- Health: `/health`, `/health/live`, `/health/ready`

Development automatically runs migrations and seeds **PH DEMO OCEAN TOWER**.

## Demo users

See [docs/DEMO-USERS.md](docs/DEMO-USERS.md). Password is Development-only; never enabled automatically in Production.

## LiveKit (optional)

Set environment variables (never commit secrets):

```text
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

Without them, the app runs; meeting token issuance reports **BLOCKED — LIVEKIT CREDENTIALS REQUIRED**. Human A/V acceptance remains separate.

## Tests

```powershell
$env:ASAMBLEAS_TEST_CONNECTION = "Host=127.0.0.1;Port=5432;Database=asambleas_tests;Username=postgres;Password=..."
.\scripts\test.ps1
```

Projects:

| Project | Purpose |
|---------|---------|
| UnitTests | Quorum, lifecycle, decision rule |
| IntegrationTests | PostgreSQL, voting, tenancy, audit |
| SecurityTests | AuthZ + cross-tenant (`CROSS_TENANT_LEAKS = 0`) |
| ArchitectureTests | Layer boundaries |
| E2ETests | Automated assembly flow (in-process); LiveKit skipped without creds |

## Solution layout

```text
src/
  Asambleas.Web              Host, UI, SignalR, APIs
  Asambleas.Application      Use cases / ports
  Asambleas.Domain           Entities & domain rules
  Asambleas.Infrastructure   EF, Identity, LiveKit, seed
  Asambleas.Contracts        DTOs
  Asambleas.Workers          Background placeholder
docs/
  adr/                       Architecture Decision Records
  08-AUDIT/                  Discovery & completion reports
```

## Documentation

- Vision / architecture / domain / database / security / UI / testing / operations / audit under `docs/`
- ADRs: `docs/adr/ADR-001` … `ADR-007`

## Security notes

- Multi-tenant from day one (`TenantId` + `ICurrentTenant`)
- Cookie auth + permission policies
- Voting uniqueness enforced in DB
- Secrets via env / User Secrets — not in `appsettings.json`
