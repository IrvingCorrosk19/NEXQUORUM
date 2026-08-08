# ADR-003 — PostgreSQL

**Status:** Accepted  
**Date:** 2026-08-08  
**EO:** EO-001

## Context

Need durable ACID storage for votes, attendance, quorum snapshots, and audit. EO-001 forbids SQLite, SQL Server, and in-memory DB for the functional app.

## Decision

- **PostgreSQL 18** as system of record.
- EF Core 10 + Npgsql.
- Integration tests use real PostgreSQL.
- Unique constraints (e.g., one vote per user per session) enforced in DB.
- Timestamps stored as **UTC** (`timestamptz`).
- Local development: Docker Compose Postgres preferred for reproducibility.

## Consequences

- Requires running Postgres for app and integration tests.
- Migrations reviewed before apply (PKs, FKs, indexes, cascade, concurrency tokens).
