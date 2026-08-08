# EO-001 Testing Guide

## Projects

| Project | Purpose |
|---------|---------|
| `Asambleas.UnitTests` | Domain: quorum, lifecycle, decision rule |
| `Asambleas.IntegrationTests` | WebApplicationFactory + PostgreSQL |
| `Asambleas.SecurityTests` | AuthN/AuthZ, cross-tenant, manipulated IDs (`CROSS_TENANT_LEAKS = 0`) |
| `Asambleas.ArchitectureTests` | Layer dependency rules (NetArchTest) |
| `Asambleas.E2ETests` | Playwright automated meeting flow |

## Connection string (integration / security)

Do **not** commit passwords in test source. Resolve in this order:

1. `ASAMBLEAS_TEST_CONNECTION`
2. `ConnectionStrings__DefaultConnection`
3. `Host=127.0.0.1;Port=5432;Database=asambleas_tests;Username=postgres;Password=$env:PGPASSWORD`

Local EO-001 convenience: run `scripts/test.ps1` which sets the connection string for the process.

Fixtures refuse to `EnsureDeleted` unless the database name looks like a test DB (`asambleas_tests` / `_tests`).

## Unit tests

```powershell
dotnet test tests/Asambleas.UnitTests/Asambleas.UnitTests.csproj
```

## Full suite (script)

```powershell
.\scripts\test.ps1
# or unit only:
.\scripts\test.ps1 -UnitOnly
```

## Playwright / E2E

Requires a running Web host (e.g. `.\scripts\run-dev.ps1`).

| Variable | Default |
|----------|---------|
| `ASAMBLEAS_BASE_URL` | `https://localhost:7188` |

HTTPS certificate errors are ignored in the E2E API context.

### Playwright config note

This repo uses **Microsoft.Playwright** (.NET) inside `Asambleas.E2ETests`, not Node `playwright.config.ts`. Equivalent settings:

- `baseURL` ← `ASAMBLEAS_BASE_URL`
- `ignoreHTTPSErrors` ← `true`
- Browser install (if UI tests are added later): `pwsh bin/Debug/net10.0/playwright.ps1 install`

Traits:

- `AutomatedMeeting` — API meeting flow (E2E-001…011)
- `Manual` — LiveKit video (skipped without credentials)

Filter:

```powershell
dotnet test tests/Asambleas.E2ETests --filter "Category=AutomatedMeeting"
```

## Security expectation

`CROSS_TENANT_LEAKS = 0` — Ocean tenant callers must never receive OTHERPH assembly/PH payloads (accept 400/403/404 deny responses).
