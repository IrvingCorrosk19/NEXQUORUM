# ASSEMBLY HISTORICAL INTEGRITY AUDIT

**Audit date:** 2026-08-12  
**Priority:** P0 for post-completion mutability  
**Method:** Code + entity model inspection (no trust of prior “CERTIFIED” docs).

---

## Executive verdict

| Area | Verdict | Notes |
|------|---------|-------|
| Historical owner identity on votes | **PASS** | Votes store user; ownership transfer does not rewrite participants |
| Historical unit participation rewrite | **PASS** | TransferOwnership does not mutate `AssemblyParticipant` |
| Vote coefficient freeze | **PASS** | `Vote.CoefficientPercent` + eligibility snapshot |
| Representation coefficient freeze | **PASS** | `CoefficientSnapshot` at accreditation; no update path |
| Quorum after Completed | **FAIL P0** | Presence/hub can append new snapshots |
| Eligible units denominator in calc | **FAIL P1** | Live `Units` used in recalculation paths |
| Acta sealed at close | **FAIL P1** | Hash regenerated from current package each read |
| Recording start after Completed | **FAIL P1** | No status gate |
| Evidence hard-delete of Completed | **PASS** | No delete API; PH purge blocks legal history |

---

## Artifact freeze table

| Artifact | When frozen | Mutable after Completed? | Evidence |
|----------|-------------|--------------------------|----------|
| `AssemblyRepresentation.CoefficientSnapshot` | Accreditation (`MaterializeForAccreditationAsync`) | No update path found | Representation service |
| `AssemblyParticipant.EffectiveCoefficientPercent` | Accreditation | Not rewritten by ownership transfer | Attendance / ownership services |
| `VotingEligibilitySnapshot` | Session open | No update; only PH purge delete | `VotingService.OpenSessionAsync` |
| `Vote.CoefficientPercent` | Cast | Immutable row | `CastVoteAsync` |
| `QuorumSnapshot` rows | Append-only timeline | **New rows can be appended** | `RecalculateAndSnapshotAsync` unguarded |
| Minutes document hash | On each GET | Regenerated (not sealed) | `AssemblyEvidenceService.GetMinutesDocumentAsync` |
| Ownership history | Ownership table | Current PH ownership changes | Separate from assembly participants |

---

## Critical chain (P0)

```
Completed assembly
  → User opens lobby/assembly.html (UI allows)
  → SignalR AssemblyHub.JoinAssembly (NO status check)
  → AttendanceService.MarkConnectedAsync (NO status check)
  → UpdatePresenceAsync → RecalculateAndSnapshotAsync
  → NEW QuorumSnapshot
  → Next acta/expediente package differs from close-time evidence
```

**Files:** `AssemblyHub.cs`, `AttendanceService.MarkConnectedAsync`, `QuorumService.RecalculateAndSnapshotAsync`, `AssemblyAccessService.EnsureCanJoinAssemblyAsync`.

**Contrast (working):** `MeetingService.GetJoinInfoAsync` correctly blocks Draft/Cancelled/Completed for LiveKit tokens.

---

## Coefficient history experiment (logical)

| Step | Expected | System behavior |
|------|----------|-----------------|
| Complete assembly with votes | Results stable | Vote rows keep coefficients → **PASS** |
| Change unit coefficient tomorrow | Past tallies unchanged | Tallies use `Vote.CoefficientPercent` → **PASS** |
| Change owner on unit | Past voter identity unchanged | Ownership ≠ rewrite participants → **PASS** |
| Reconnect to Completed room via SignalR | Quorum frozen | **FAIL** — can append snapshot |
| GetLatest quorum | Show AssemblyEnd snapshot | Shows latest including any post-end presence snap → **FAIL** |

---

## Convocation / survey / speaker after Completed

| Module | Guard? | Severity |
|--------|--------|----------|
| Convocation resend | No status check | P2 |
| Survey form publish/submit | No assembly status check | P2 |
| Speaker request | Status-gated | PASS |
| Speaker grant/reject/skip | No assembly status | P2 |
| Motion create | Blocked Completed/Cancelled | PASS |
| Motion update | Weaker | P2 |
| Agenda mutate | Blocked Completed/Cancelled | PASS |

---

## Snapshot architecture recommendation (remediation input only)

1. Freeze quorum: reject `RecalculateAndSnapshotAsync` when status ∈ {Completed, Cancelled}; hub join read-only or deny.
2. Seal minutes package hash at Complete; subsequent GET returns sealed blob.
3. Snapshot eligible-units denominator into AssemblyEnd quorum row (already stores counts — stop live recompute for display after Complete).
4. Historical UI mode: ban Sala/live CTAs; banner; read-only room shell if retained.
