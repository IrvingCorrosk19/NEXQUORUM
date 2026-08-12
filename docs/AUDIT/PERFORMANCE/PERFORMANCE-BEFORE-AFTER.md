# ASAMBLEAS — Performance Before/After

**Measured:** 2026-08-12  
**VPS:** https://asambleas.164.68.99.83.nip.io  
**Migration applied on VPS:** `20260812115954_PerformanceOptimizationIndexes`

## VPS HTTP latency (post-deploy, authenticated)

Source: `artifacts/perf-vps-after.json`

| Endpoint | Status | After (ms) | Payload (bytes) |
|----------|--------|------------|-----------------|
| login | 200 | 1156 | 988 |
| ph-list | 200 | 1698 | 1097 |
| ph-owners | 200 | 367 | 2 |
| ph-units | 200 | 259 | 2 |
| ph-readiness | 200 | 267 | 733 |
| calendar/events | 200 | 249 | 105 |
| **assembly-dashboard** | **200** | **353** | 2454 |
| **assembly-readiness** | **200** | **206** | 2027 |
| agenda | 200 | 213 | 823 |
| motions | 200 | 279 | 874 |
| quorum | 200 | 220 | 272 |
| convocations | 200 | 245 | 2 |
| health/live | 200 | 180 | 7 |
| health/ready (HTTPS) | 200 | **704** | — |

## Local HTTP latency (optimized build, demo seed)

Source: `artifacts/perf-local-after.json`

| Endpoint | Status | After (ms) |
|----------|--------|------------|
| assembly-dashboard | 200 | 138 |
| assembly-readiness | 200 | 32 |
| ph-list | 200 | 18 |

## Query design changes

| Workflow | Before (design) | After (design) |
|----------|-----------------|----------------|
| Assembly readiness | 7 queries + load all unit coefficients | 7 aggregate queries (SQL `GROUP BY`) |
| Assembly dashboard | Readiness + duplicate participant/count queries (~12+) | Shared `AssemblyMetricsLoader` (~10) |
| Voting eligibility (300 p.) | 1 + 2×N representation lookups | 1 + 2 batch queries |
| Convocation email batch | N × (assembly + PH + agenda + ownership) | 1 prefetch + N access-link issues |
| Calendar list | In-memory PH/status/modality filter | Server-side SQL filters |

## DB backup (pre-deploy)

`/opt/apps/asambleas/deploy/vps/backups/pre_perf_20260812_072026.sql.gz` (51350 bytes, verified on VPS)

## Regression

| Suite | Result |
|-------|--------|
| Release build | PASS |
| Unit tests | 65/65 |
| Architecture | 3/3 |
| Integration (readiness/RBAC/dashboard subset) | 12/12 |
| VPS browser E2E | PASS (login → PH → dashboard readiness → convocation → acreditación) |
