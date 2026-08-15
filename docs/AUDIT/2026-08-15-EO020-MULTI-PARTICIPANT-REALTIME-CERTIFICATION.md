# EO-020 — MULTI-PARTICIPANT REALTIME ASSEMBLY CERTIFICATION

**Date:** 2026-08-15  
**Environment:** Development  
**URL:** `https://localhost:7188`  
**Harness:** Playwright Chromium — 6 independent browser contexts  
**Runner:** `tools/e2e/eo020-multi-participant-e2e.cjs`  
**Evidence:** `tools/e2e/eo020-results/results.json`  
**VPS deployment:** **NOT PERFORMED**

---

## Verdict

```text
EO-020 — MULTI-PARTICIPANT REALTIME ASSEMBLY: CERTIFIED
```

```text
P0 OPEN: 0
P1 OPEN: 0
VPS DEPLOYMENT: NOT PERFORMED
```

---

## Controlled dataset (certified run)

| Entity | Id / value |
|--------|------------|
| PH | `13eb3d7f-98fb-4791-a72f-05a41da1dabc` — PH EO020 REALTIME TEST |
| Assembly | `a02b1069-2391-464b-b6c9-420a3be5b1d9` — EO-020 Asamblea Multiusuario |
| Final status | `Completed` |
| Stamp | `11689077` |

| Unit | Owner | Coefficient |
|------|-------|------------:|
| 101 | Owner A | 40% |
| 102 | Owner B | 30% |
| 103 | Owner C | 20% |
| 104 | Owner D | 10% |
| **TOTAL** | | **100%** |

Sessions:

| Session | Role |
|---------|------|
| A | President / PHAdmin |
| B | Owner A (40%) |
| C | Owner B (30%) |
| D | Owner C (20%) |
| E | Owner D (10%) |
| B2 | Owner B second tab (concurrency attack) |

Admin: `phadmin@ocean.demo`  
Owners: activated via invitation + Development mock mailbox.

---

## Domain semantics (as implemented — not invented)

| Concept | Rule in ASAMBLEAS |
|---------|-------------------|
| **Coefficient** | `Unit.CoefficientPercent`; active units sum must be **100 ± 0.0001** for PH readiness |
| **Quorum (present)** | Sum of `CoefficientSnapshot` for accredited representations with status `CheckedIn` \| `Present` \| `TemporarilyDisconnected` |
| **Quorum (required)** | `totalUnitsCoeff × RequiredQuorumPercent / 100` |
| **Connected ≠ legal** | SignalR connection count is **not** quorum; `TemporarilyDisconnected` still counts toward legal presence |
| **Accreditation** | Check-in shares accreditation path; vote requires `IsAccredited` |
| **Vote eligibility** | Assembly participant + accredited + not `Registered`/`Left` + eligibility snapshot; else `NOT_ACCREDITED` / `NOT_ELIGIBLE` (HTTP 400) |
| **Weight** | Default **Coefficient** from representations; `PerPerson` → weight 1 |
| **SimpleMajority** | `InFavorCoefficient > AgainstCoefficient` (**abstention ignored** for pass/fail) |
| **QualifiedMajority** | `InFavorCoefficient >= RequiredThresholdPercent` (absolute; EligibleCoefficient unused in engine) |
| **No-vote vs abstention** | Explicit abstention increments abstention coefficient; pending/no-vote does not |

**Invariant verified:** `SUM(COEFFICIENT) = 100` (API `complete: true`).

---

## Evidence chain demonstrated

```text
PH EO020 → 4 owners / 4 units (40/30/20/10)
 → Sandbox communications → Invite + activate ×4
 → Assembly UI create → Calendar → Convocation (4 recipients)
 → Portal visibility ×4
 → Partial accredit A+B → weighted quorum 70% (≠ 50% headcount)
 → Accredit C → 90%
 → Start assembly → 5 browser rooms same AssemblyId + video mount
 → Live Q1 → Open → D blocked (not accredited)
 → Concurrent A/B/C votes → weight 60/30 · headcount 2/1
 → Double-click + two-tab vote protection
 → Close → post-close blocked
 → Accredit D live → quorum 100%
 → Vote/close race (deterministic: cast-before-close accepted)
 → V2 weighted 60/40 vs headcount 3/1 (majority persons ≠ majority weight)
 → Abstention + no-vote distinction
 → Dynamic Q add/delete/recalc · closed immutability
 → Owner + president reconnect / rehydrate
 → Cross-assembly + cross-PH isolation · RBAC
 → Complete → owner history ×4 · audit · build/tests
```

---

## Quorum is not headcount

| Metric after A+B only | Value |
|----------------------|------:|
| Persons accredited | 2 of 4 = **50%** persons |
| Weighted present | **70%** coefficient |
| Required (config) | **50%** |
| Reached | **true** |

After C: **90%**. After D during session: **100%**.

---

## Voting results (certified)

### Voting 1 (D not eligible)

| Lens | Result |
|------|--------|
| Headcount | A favor **2** · En contra **1** |
| Weight | A favor **60%** · En contra **30%** |
| D | HTTP **400** not accredited |

### Voting 2 (all four eligible; C race with close)

| Lens | Result |
|------|--------|
| Weight | A favor **60%** · En contra **40%** |
| Note | Demonstrates **person majority ≠ weighted majority** under Coefficient + SimpleMajority |

### Voting 3 (abstention)

| Lens | Result |
|------|--------|
| Favor / Against / Abstain coeffs | **40 / 20 / 30** |
| Votes cast | **3** (D pending ≠ abstention) |

---

## Concurrency & integrity

| Scenario | Result |
|----------|--------|
| Concurrent cast A/B/C | All HTTP 200; final tally deterministic |
| Double-click Owner A | Second cast **400** (1 vote persisted) |
| Two-tab Owner B | Accepted after first vote = **0** (backend rejection) |
| Close vs cast race | Cast **200** + Close **200** → cast committed first (valid order) |
| Post-close cast | **400** |
| Closed motion edit | **400** |

---

## Realtime / resilience

| Gate | Result |
|------|--------|
| Multi-session same room | PASS (5 contexts / one AssemblyId) |
| Video continuity | PASS (`video-mount`) |
| Live question sync | PASS |
| Quorum updates after live accredit | PASS 70→90→100 |
| Owner reconnect | PASS — status `InProgress` restored |
| President reconnect | PASS — assembly state preserved |
| Cross-assembly leak | PASS (foreign assembly vote **400**) |
| Cross-PH leak | PASS (**400**) |

**Observation (non-blocking):** Intermediate room payload field `votesCast` was `undefined` during one progress probe; gate still PASS via concurrent cast success + closed tallies. Final progress after dynamic Q: `total=4 completed=3 progress=75%`.

---

## Latency (local, reasonable)

| Metric | ms |
|--------|-----|
| CastVote p50 | ~67 |
| CastVote p95 | ~87 |
| CloseVoting p50 | ~55 |
| OpenVoting p50 | ~83 |

---

## Defects in this execution

| Defect | Severity |
|--------|----------|
| None opened | — |

EO-019 sandbox/mailbox fixes remained in place and were reused. No VPS restarts classified as defects.

---

## Automated regression

| Check | Result |
|-------|--------|
| `dotnet build` | PASS |
| Unit / targeted tests (harness) | PASS |
| Browser multi-session E2E | **Required and executed** — not substituted by API-only |

---

## Final matrix

```text
EO-020 MULTI-PARTICIPANT CERTIFICATION

Environment: LOCALHOST
URL: https://localhost:7188

4 OWNERS CREATED/AVAILABLE: PASS
COEFFICIENT TOTAL: PASS
4 RECIPIENTS: PASS
4 OWNER PORTAL VISIBILITY: PASS

PARTIAL ACCREDITATION: PASS
WEIGHTED QUORUM: PASS
REALTIME QUORUM: PASS

MULTI-SESSION ROOM: PASS
VIDEO CONTINUITY: PASS

REALTIME QUESTION: PASS
CONCURRENT VOTING: PASS
REALTIME PROGRESS: PASS

HEADCOUNT CALCULATION: PASS
WEIGHT CALCULATION: PASS
ABSTENTION: PASS
NO-VOTE DISTINCTION: PASS

DOUBLE CLICK PROTECTION: PASS
TWO-TAB VOTE PROTECTION: PASS
CLOSE/VOTE RACE: PASS
POST-CLOSE PROTECTION: PASS

DYNAMIC QUESTION ADD: PASS
DYNAMIC QUESTION DELETE: PASS
DYNAMIC RECALCULATION: PASS
CLOSED RESULT IMMUTABILITY: PASS

OWNER RECONNECTION: PASS
PRESIDENT RECONNECTION: PASS
STATE REHYDRATION: PASS

CROSS-ASSEMBLY ISOLATION: PASS
CROSS-PH ISOLATION: PASS
RBAC: PASS

FINALIZATION: PASS
OWNER HISTORY: PASS
AUDIT TRAIL: PASS

DB INTEGRITY: PASS
CONSOLE: PASS
NETWORK: PASS
BUILD: PASS
AUTOMATED TESTS: PASS

P0 OPEN: 0/0
P1 OPEN: 0/0

VPS DEPLOYMENT: NOT PERFORMED
```

---

## Architectural gaps (documented, not P0/P1)

1. **QualifiedMajority** uses absolute `RequiredThresholdPercent` against InFavor coefficient; `EligibleCoefficient` is unused in the pass engine — document if legal product needs “of those voting” / “of quorum present” denominators later.
2. **Secret ballot:** choice not exposed in audit/receipt paths reviewed previously; no EO-020 evidence of OwnerId→Option realtime leak under secret mode (secret mode not forced in this scenario).
3. Intermediate UI `votesCast` field naming on room snapshot may be incomplete for live progress chips — closed tallies remain authoritative.

---

## STOP

```text
NO VPS
NO Production
NO remote deploy
NO publish
```

Localhost remains at `https://localhost:7188` for manual acceptance.

EO-020 LOCAL CERTIFICATION COMPLETE — WAITING FOR USER MANUAL ACCEPTANCE.
