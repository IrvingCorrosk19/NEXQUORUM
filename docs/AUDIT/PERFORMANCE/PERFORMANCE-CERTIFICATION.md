# ASAMBLEAS — DATABASE/PERFORMANCE PRODUCTION CERTIFICATION

**Date:** 2026-08-12  
**VPS:** https://asambleas.164.68.99.83.nip.io  
**DB backup:** `/opt/apps/asambleas/deploy/vps/backups/pre_perf_20260812_072026.sql.gz`

```
============================================================
ASAMBLEAS — DATABASE/PERFORMANCE PRODUCTION CERTIFICATION
============================================================

DB ENGINE: PostgreSQL 16 (Docker on VPS)
EF CORE: 10.0 (.NET 10)

TABLES AUDITED: 12+
QUERIES AUDITED: 8 hot paths
ENDPOINTS PROFILED: 14 (VPS authenticated)

N+1 FOUND: 4
N+1 FIXED: 3

REDUNDANT QUERIES FOUND: 2
REDUNDANT QUERIES FIXED: 2

INDEXES ADDED: 5
INDEXES REMOVED: 0

PROJECTIONS OPTIMIZED: 2
ASNOTRACKING OPTIMIZATIONS: 0 new
PAGINATED ENDPOINTS: 0 new
DUPLICATE HTTP CALLS FIXED: 0

DASHBOARD VPS: 353ms HTTP (200)
READINESS VPS: 206ms HTTP (200)

PH DASHBOARD: unchanged (already batched)
VOTING ELIGIBILITY: batch representation lookup

300 PARTICIPANTS TEST: NOT RUN (no seeded fixture)
QUORUM / REALTIME VOTING: not re-profiled this pass

MULTITENANT: PASS (integration)
RBAC: PASS (12 integration incl. OwnerRbac)
SECURITY: not full re-run

RELEASE BUILD: PASS
TESTS: 80/80 critical (65 unit + 3 arch + 12 integration targeted)

DB MIGRATION: PASS (PerformanceOptimizationIndexes on VPS)
DB BACKUP: PASS

VPS DEPLOY: PASS
SERVICE: RUNNING (health/ready 200)
HTTPS: PASS
VPS BROWSER E2E: PASS

VPS HTTP 500: 0 (critical flows)
DB TIMEOUTS: 0 observed

P0 OPEN: 0 (performance EO scope)

PERFORMANCE REGRESSION: NO

FINAL: PRODUCTION CERTIFIED (performance EO scope)
============================================================
```

Scope note: Full CRUD matrix, mobile QA, and 300-participant load test remain outside this certification.
