# ADR-001 — Modular Monolith

**Status:** Accepted  
**Date:** 2026-08-08  
**EO:** EO-001

## Context

ASAMBLEAS will grow into a PH Governance Operating System spanning convocatorias, quorum, voting, audit, and meeting media. Starting with microservices would multiply operational cost before product-market fit.

## Decision

Build a **Modular Monolith**:

- Single deployable (`Asambleas.Web` + workers).
- Clear module boundaries: Identity, Tenancy, PropertyHorizontal, Ownership, Assembly, Attendance, Quorum, Agenda, Motion, Voting, Meeting, Audit.
- Domain rules live in `Asambleas.Domain` / `Asambleas.Application`.
- Infrastructure (EF, LiveKit, Identity stores) isolated in `Asambleas.Infrastructure`.
- Modules communicate via application services and domain events in-process — **not** via HTTP between modules.

## Consequences

- Fast local iteration and transactional consistency for voting/audit.
- Future extraction of Meeting or Voting remains possible if boundaries stay clean.
- Forbidden in EO-001: Kafka, Redis (unless proven necessary), Kubernetes, ceremonial CQRS.
