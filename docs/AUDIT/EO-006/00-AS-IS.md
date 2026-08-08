# EO-006 — AS-IS Assessment

**Date:** 2026-08-08  
**App:** http://localhost:5188 (health 200)  
**Build:** `Asambleas.sln` succeeded (0 warnings)  
**Status:** OBSERVED before domain hardenings

## Mission chain (current truth)

```text
Participant (AssemblyParticipant)
  → single UnitId (seed 1:1)
  → CheckIn / Hub Present (same AttendanceStatus enum)
  → QuorumEngine(sum present unit coefficients)
  → VotingService(unit.CoefficientPercent)
```

**Missing links:** Representation, Powers, distinct Accreditation, Ownership as SoT.

---

## Inventory classification

| Concept | Status | Notes |
|---------|--------|-------|
| Tenant / PH / Unit | WORKING | `Unit.CoefficientPercent` decimal(7,4) |
| Owner | PARTIAL | Seeded; no Owner API |
| Ownership | MOCKED / UNUSED | Unique `(UnitId, OwnerId)`; never queried by Application |
| Coefficient SoT | WORKING (wrong for EO-006) | Unit only; Ownership.SharePercent ignored |
| Representation | MISSING | No entity / service / events |
| Powers / Proxy | MISSING | No Power model |
| Accreditation | MOCKED | UI says “Accredited” for CheckedIn/Present |
| Self check-in | WORKING | `POST .../attendance/check-in` uses **current user** |
| Operator accredit others | BROKEN | UI sends unitId but not targetUserId → checks in operator |
| Presence | PARTIAL | Hub Join → Present; counts for quorum without check-in |
| Quorum engine | WORKING | `QuorumEngine`; threshold `Assembly.RequiredQuorumPercent` |
| QuorumSnapshots | WORKING | Persist + history API |
| Double unit count | PARTIAL | Distinct UnitId in sum; **no DB unique** on assembly+unit |
| Multi-unit person | MISSING | One UnitId per participant |
| Voting eligibility | PARTIAL | Attendance gate; coeff from Unit; no Ownership/Power |
| Audit (check-in/quorum) | WORKING | CHECK_IN, QUORUM_CHANGED, connect/disconnect |
| Audit (power/rep) | MISSING | — |
| SignalR attendance/quorum | WORKING | `participantUpdated`, `quorumUpdated` |

---

## Source of truth today

| Concept | Authority |
|---------|-----------|
| Coefficient | `Unit.CoefficientPercent` |
| Who represents a unit | `AssemblyParticipant.UnitId` (implicit) |
| Accreditation | Conflated with `AttendanceStatus` |
| Presence | Same enum + SignalR Hub |
| Quorum | `QuorumService` → `QuorumEngine` |
| Required threshold | `Assembly.RequiredQuorumPercent` (demo 50.00) |

---

## Critical defects (P0)

1. **Operator check-in broken** — cannot accredit another participant.
2. **No representation graph** — person ≠ multi-unit; proxy impossible.
3. **Ownership dead** — voting/quorum ignore share rows.
4. **Hub Present without accreditation** counts toward quorum.
5. **Frontend may influence unit** on check-in/vote without ownership proof.

---

## Demo seed (Ocean)

| Unit | Coeff | Owner user |
|------|-------|------------|
| 101–106 | 14% each | owner101–106 |
| 107 | 8% | president |
| 108 | 8% | secretary |
| **Sum** | **100%** | |

Threshold: 50%. Password: `Demo!Pass123` (see `docs/DEMO-USERS.md`).

---

## Keep (do not rewrite)

- `QuorumEngine.Calculate` formula
- Append-only `AttendanceRecord`
- Unique `(AssemblyId, UserId)` on participants
- Vote uniqueness / EO-005 integrity
- Snapshot + SignalR publish-after-commit pattern

## Minimal fix path

1. Fix operator target userId + `AttendanceManage`
2. `IsAccredited` + materialize `AssemblyRepresentation` (unique Assembly+Unit)
3. Wire Ownership + Power → effective coefficient
4. Quorum from accredited+present representations
5. Voting reads `IAssemblyRepresentationService`
6. Tablet check-in UIX + conflict UI
7. Concurrency/security tests + docs

---

## Verdict

**EO-006 NOT CERTIFIED** at AS-IS. Core quorum math exists; governance chain (identity → representation → accreditation → quorum) is incomplete and operator accreditation is broken.
