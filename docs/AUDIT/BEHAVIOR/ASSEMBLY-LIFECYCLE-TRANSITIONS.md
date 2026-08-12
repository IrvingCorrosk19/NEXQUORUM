# ASSEMBLY LIFECYCLE TRANSITIONS

**Audit date:** 2026-08-12  
**Source of truth:** `AssemblyLifecycle.cs`, `AssemblyService.cs`, `CalendarSchedulingService.cs`  
**Status:** DIAGNOSTIC ONLY — no remediation applied in this pass.

---

## Official domain states (do not invent Closed/Finalized)

| DB / API (`AssemblyStatus`) | UI (es) | User checklist alias |
|-----------------------------|---------|----------------------|
| `Draft` | Borrador | DRAFT |
| `Scheduled` | Programada | SCHEDULED / CONVOCATION (action, not status) |
| `CheckIn` | Acreditación | ACCREDITATION |
| `InProgress` | En curso / EN VIVO | LIVE |
| `Paused` | Pausada | SUSPENDED |
| `Completed` | Completada / **Finalizada** | CLOSED + FINALIZED (single terminal) |
| `Cancelled` | Cancelada | CANCELLED |

**Finding BEH-LIFE-001 (P1 naming):** There is **no** separate `Closed` vs `Finalized`. Permission `assembly:close` and endpoint `POST …/complete` set status to **`Completed`**. UI often labels it “Finalizada”.

**Finding BEH-LIFE-002 (P3):** “Convocatoria” is a **module/action**, not an assembly status.

---

## State machine (code)

```
Draft ──► Scheduled ──► CheckIn ──► InProgress ◄──► Paused ──► Completed
  │            │            │
  └────────────┴────────────┴──► Cancelled
```

Rules: `Asambleas.Domain.Services.AssemblyLifecycle.CanTransition`.

Invalid (enforced): `Completed → *`, `InProgress → Cancelled`, `Cancelled → *`, etc.

---

## Transition catalog

| FROM | TO | WHO (permission) | ACTION | PRECONDITIONS | SIDE EFFECTS | AUDIT | REVERSIBLE? |
|------|-----|------------------|--------|---------------|--------------|-------|-------------|
| — | Draft / Scheduled | `assembly:schedule` | `POST /api/assemblies` (`CreateAndScheduleAsync`) | PH schedule rights; conflict checks | If `PublishAsScheduled` → Scheduled else Draft; reminders; creator participant | create/schedule | N/A |
| Draft | Scheduled | *(lifecycle allows)* | **NO dedicated API found** | — | — | — | — |
| Scheduled | CheckIn | `assembly:start` | `POST …/start-checkin` | From Scheduled only | Status; realtime | `AssemblyJoin` | No |
| CheckIn / Paused | InProgress | `assembly:start` / resume | `POST …/start` or `…/resume` | Lifecycle | Status; realtime | `AssemblyStarted` / `AssemblyResumed` | Pause yes |
| InProgress | Paused | `assembly:manage` | `POST …/pause` | From InProgress | Status | `AssemblyPaused` | Resume |
| InProgress / Paused | Completed | `assembly:close` | `POST …/complete` | **No open voting sessions** | Status; quorum snapshot `"AssemblyEnd"` | `AssemblyCompleted` | **No** |
| Draft / Scheduled / CheckIn | Cancelled | `assembly:cancel` | `POST …/cancel` | Reason ≥ 3 chars | Cancel fields; reminders; notify | cancel | No |

### Edit / reschedule (not status change)

| Action | Allowed statuses | Permission | Notes |
|--------|------------------|------------|-------|
| `PUT /api/assemblies/{id}` details | Draft, Scheduled, CheckIn | `assembly:schedule` | Does **not** publish Draft→Scheduled |
| `POST …/reschedule` | Draft, Scheduled, CheckIn (service) | `assembly:reschedule` | Schedule version / history |

---

## Gaps

| ID | Severity | Gap |
|----|----------|-----|
| BEH-TR-001 | P1 | Draft→Scheduled allowed in domain but **no Transition API** — Draft can remain stuck unless created published |
| BEH-TR-002 | P2 | No “seal expediente” step after Completed (acta hash regenerated on read) |
| BEH-TR-003 | P3 | Product language “Finalizada/Cerrada” ≠ enum |

---

## Side-effect map on Complete

1. Status → `Completed`
2. Audit `AssemblyCompleted`
3. Quorum `RecalculateAndSnapshotAsync(..., "AssemblyEnd")`
4. Open voting sessions must already be closed (precondition)
5. LiveKit join subsequently blocked (`MeetingService.GetJoinInfoAsync`)
6. Check-in / vote cast subsequently blocked
