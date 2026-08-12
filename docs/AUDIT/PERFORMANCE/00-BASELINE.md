# ASAMBLEAS — Performance Audit Baseline

**Date:** 2026-08-12  
**Scope:** Database/query hardening EO — baseline before optimizations deployed to VPS.

## Architecture audited

| Layer | Components |
|-------|------------|
| DbContext | `AsambleasDbContext` (single context) |
| Hot services | `AssemblyReadinessService`, `AssemblyRoomService.GetDashboardAsync`, `DeliveryDispatchService`, `VotingService.BuildEligibilityAsync`, `CalendarSchedulingService.ListEventsAsync`, `PhOnboardingService.ListPhAsync` |
| Tenant filters | `TenantGuard`, global query filters on `ITenantScoped` entities |
| Migrations | EF Core 10 + PostgreSQL 16 (VPS) |

## Methodology

1. **HTTP latency** — `artifacts/perf-baseline.mjs` against VPS (authenticated demo operator), 1 sample per endpoint (p50/p95 require repeated runs; script supports `--label before|after`).
2. **Query count** — inferred from code audit + consolidated loaders (EF query logging not enabled on production).
3. **No invented numbers** — VPS measurements stored in `artifacts/perf-vps-before.json` / `artifacts/perf-vps-after.json`.

## Code hotspots identified (pre-fix)

| Area | Issue | Severity |
|------|-------|----------|
| `AssemblyReadinessService` | 7 sequential DB round-trips + full unit coefficient list | High |
| `GetDashboardAsync` | Duplicated counts vs readiness | High |
| `DeliveryDispatchService.ComposePremiumEmailAsync` | N× re-query assembly/PH/agenda/ownership per email | Critical |
| `VotingService.BuildEligibilityAsync` | N× representation lookup per participant | High |
| `CalendarSchedulingService.ListEventsAsync` | PH/status/modality filtered in memory after wide fetch | Medium |

## Optimizations implemented (this change set)

1. `AssemblyMetricsLoader` — parallel aggregated counts (participants, units, agenda, motions, surveys, convocations, email channel).
2. Dashboard reuses metrics for readiness + counts (single metrics load).
3. `GetActiveForUsersAsync` batch representation lookup for voting eligibility.
4. `DeliveryDispatchService` — prefetch email compose context per batch.
5. Calendar — server-side PH/status/modality filters before materialization.
6. Migration `PerformanceOptimizationIndexes` — 5 composite indexes (assemblies calendar, representations batch, quorum timeline, delivery events).

## Regression gates

| Gate | Local result |
|------|----------------|
| Release build | PASS (0 errors) |
| Unit tests | 65/65 PASS |
| Architecture tests | 3/3 PASS |
| Integration tests | BLOCKED — local PostgreSQL password not configured (`ASAMBLEAS_TEST_CONNECTION`) |
| Security/E2E tests | BLOCKED — same DB dependency |

## VPS measurement commands

```powershell
# Password from VPS .env (do not commit)
$env:DEMO_PASSWORD = '<from VPS /opt/apps/asambleas/deploy/vps/.env>'
node artifacts/perf-baseline.mjs --label before --out artifacts/perf-vps-before.json
# After deploy:
node artifacts/perf-baseline.mjs --label after --out artifacts/perf-vps-after.json
```

See `PERFORMANCE-BEFORE-AFTER.md` for measured endpoint comparison after VPS deploy.
