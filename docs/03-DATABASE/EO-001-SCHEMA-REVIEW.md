# EO-001 Schema Review — PostgreSQL / EF Core

**Status:** Reviewed prior to initial migration  
**Date:** 2026-08-08  
**Migration name:** `20260808_InitialEO001`  
**Provider:** PostgreSQL 18 + Npgsql + EF Core 10

## Scope

Initial durable schema for ASAMBLEAS EO-001: tenancy, property horizontal, ownership, assembly lifecycle, attendance, agenda, motions, voting, quorum snapshots, speaker queue, audit, and ASP.NET Identity stores.

## Primary keys

| Table | PK | Type |
|-------|----|------|
| All domain tables | `Id` | `uuid` |
| Identity (`AspNetUsers`, `AspNetRoles`, …) | standard Identity PKs | `uuid` |

All domain entities inherit `Entity.Id` (`Guid`). Timestamps: `CreatedAtUtc`, `UpdatedAtUtc` as `timestamptz`.

## Foreign keys and delete behavior

| Child | Parent | On delete | Rationale |
|-------|--------|-----------|-----------|
| `organizations` | `tenants` | **Restrict** | Preserve tenant history |
| `property_horizontals` | `tenants`, `organizations` | **Restrict** | PH must not vanish with org soft-errors |
| `units` | `property_horizontals` | **Restrict** | Ownership integrity |
| `ownerships` | `units`, `owners` | **Restrict** | Legal ownership trail |
| `assemblies` | `property_horizontals` | **Restrict** | Assembly is governance record |
| `assembly_participants` | `assemblies` | **Cascade** | Participants belong to assembly |
| `attendance_records` | `assemblies` | **Cascade** | Operational log scoped to assembly |
| `agenda_items` | `assemblies` | **Cascade** | Agenda owned by assembly |
| `motions` | `assemblies` | **Cascade** | Motions owned by assembly |
| `motions` | `agenda_items` | **Restrict** | Prevent orphaning agenda reference unexpectedly |
| `voting_sessions` | `assemblies` | **Cascade** | Session scoped to assembly |
| `voting_sessions` | `motions` | **Restrict** | Keep motion↔session link explicit |
| `votes` | `voting_sessions`, `assemblies` | **Restrict** | Ballots are immutable evidence — no cascade wipe |
| `quorum_snapshots` | `assemblies` | **Cascade** | Snapshots are assembly-scoped |
| `speaker_requests` | `assemblies` | **Cascade** | Queue scoped to assembly |
| `audit_events` | `assemblies` (optional) | **Restrict** | Audit must survive assembly deletion attempts |

## Unique constraints / indexes

| Table | Unique / index | Purpose |
|-------|----------------|---------|
| `tenants` | unique(`Code`) | Tenant code lookup |
| `organizations` | unique(`TenantId`, `Code`) | Per-tenant org codes |
| `property_horizontals` | unique(`TenantId`, `Code`) | Per-tenant PH codes |
| `units` | unique(`PropertyHorizontalId`, `Code`) | Unit codes per PH |
| `owners` | unique(`TenantId`, `Email`) | Owner identity |
| `ownerships` | unique(`UnitId`, `OwnerId`) | One ownership edge |
| `assembly_participants` | unique(`AssemblyId`, `UserId`) | One participant row |
| `agenda_items` | unique(`AssemblyId`, `Ordinal`), unique(`AssemblyId`, `Code`) | Ordered agenda |
| `motions` | unique(`AssemblyId`, `Code`) | Motion codes |
| **`votes`** | **unique(`VotingSessionId`, `UserId`)** | **ADR-006: one ballot per user per session** |

Supporting indexes (non-unique): `TenantId`, `AssemblyId`, `UserId`, `VotingSessionId`, `Status` on high-churn / filter tables (`assemblies`, `votes`, `attendance_records`, `speaker_requests`, `audit_events`, `quorum_snapshots`).

## Decimal precision

| Column | Precision | Notes |
|--------|-----------|-------|
| `units.CoefficientPercent` | `decimal(7,4)` | Demo sum = 100.00 |
| `ownerships.SharePercent` | `decimal(7,4)` | Share within unit |
| `assemblies.RequiredQuorumPercent` | `decimal(7,4)` | Demo default 50.00 |
| `votes.CoefficientPercent` | `decimal(7,4)` | Snapshot at cast time |
| `quorum_snapshots.PresentCoefficient` / `RequiredCoefficient` | `decimal(7,4)` | Live quorum math |

## Concurrency

| Entity | Mechanism |
|--------|-----------|
| `assemblies.RowVersion` | PostgreSQL **`xmin`** via `IsRowVersion()` on `uint` property |

Optimistic concurrency protects assembly lifecycle transitions (start / close / active agenda).

## Multitenancy filters

Global EF query filters on all `ITenantScoped` entities: `TenantId == ICurrentTenant.TenantId`.

- Empty `TenantId` (`Guid.Empty`) matches **no** tenant-scoped business rows (safe default).
- `ApplicationUser` filter bypasses when `TenantId` is empty so login can resolve users.
- Seed / admin / cross-tenant ops use `IgnoreQueryFilters()` or set `CurrentTenant` explicitly.

`Tenant` itself is **not** filtered (platform-level directory).

## Enum storage

Status enums stored as **strings** (`HasConversion<string>()`) for readability in SQL and auditability: `AssemblyStatus`, `AttendanceStatus`, `MotionStatus`, `VotingSessionStatus`, `VoteChoice`, `QuorumStatus`, `SpeakerRequestStatus`, `PresenceType`.

## Audit metadata

`audit_events.MetadataJson` mapped as **`jsonb`**. Cascade delete from assembly is **forbidden** (Restrict).

## Identity

- `ApplicationUser : IdentityUser<Guid>` with `TenantId`, `OrganizationId?`, `DisplayName`, `DemoRole`.
- `ApplicationRole : IdentityRole<Guid>`.
- Permission claims type: `permission` (seeded from `RolePermissionMap`).

## LiveKit / secrets

No secrets in schema or migrations. LiveKit credentials are configuration/env only (`LIVEKIT_*`). Demo password `Demo!Pass123` exists **only** in `DemoDataSeeder`, gated to **Development**, never Production.

## Migration checklist (pre-apply)

- [x] PKs on all tables  
- [x] FKs with Restrict on votes / audit  
- [x] Cascade on agenda (and related assembly children where appropriate)  
- [x] Unique `(VotingSessionId, UserId)` on votes  
- [x] `TenantId` / `AssemblyId` indexes  
- [x] `decimal(7,4)` coefficients  
- [x] `xmin` concurrency on assemblies  
- [x] `timestamptz` for UTC timestamps  
- [ ] Apply migration against PostgreSQL 18 (Docker Compose) after review  

## Out of scope for EO-001 initial migration

- Soft-delete columns  
- Partitioning of `audit_events`  
- Row-level security (RLS) policies (EF filters are the first line; RLS can be added later)
