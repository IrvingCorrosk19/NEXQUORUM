# ADR-007 — Audit

**Status:** Accepted  
**Date:** 2026-08-08  
**EO:** EO-001

## Context

PH assemblies require reconstructible evidence of who did what, when, under which tenant/assembly.

## Decision

- Persist `AuditEvent` rows for critical actions (login, check-in, quorum, speaker, motion, voting lifecycle, disconnect/reconnect).
- Include: TenantId, AssemblyId (when applicable), UserId, EventType, CorrelationId, UTC timestamp, structured metadata JSON.
- **Do not** write secret ballot choices to general application logs.
- Audit is append-oriented for EO-001 (no silent updates).

## Consequences

- Slight write amplification.
- Enables EO-001 completion evidence and future actas/evidence packages.
