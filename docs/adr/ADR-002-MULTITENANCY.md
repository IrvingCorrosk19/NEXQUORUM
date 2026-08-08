# ADR-002 — Multitenancy

**Status:** Accepted  
**Date:** 2026-08-08  
**EO:** EO-001

## Context

Organizations administer multiple PHs. Cross-tenant leakage is an unacceptable governance risk.

## Decision

- Hierarchy: **Platform → Organization → PropertyHorizontal → Assembly**.
- Enterprise entities carry `TenantId`; PH-scoped entities also carry `PropertyHorizontalId`.
- Resolve tenant from authenticated session via `ICurrentTenant` — **never** trust browser-supplied tenant IDs for authorization.
- EF query filters enforce `TenantId` isolation; security tests assert `CROSS_TENANT_LEAKS = 0`.

## Consequences

- Slightly more ceremony on every entity.
- Seed includes Tenant A (demo) and Tenant B (isolation target).
- Single-tenant shortcuts are forbidden.
