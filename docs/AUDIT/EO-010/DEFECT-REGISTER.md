# EO-010 — Defect Register

**Date:** 2026-08-09  
**Scope:** Open defects for final certification gate

---

## Open P0

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| — | P0 | — | **Open count = 0** |

## Open P1

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| — | P1 | — | **Open count = 0** |

No new P0/P1 defects logged from this certification documentation pass. Prior automated integrity suites green for covered paths.

---

## Known MISSING / deferred (P2)

| ID | Severity | Title | Notes |
|----|----------|-------|-------|
| DEF-P2-001 | P2 | Minutes versioning / finalize workflow | Evidence package + fact minutes exist; **no persisted editable versions**. Source: EO-008 known limitations. **MISSING** |
| DEF-P2-002 | P2 | Server-generated PDF | Print-to-PDF client path only; **no server PDF**. Source: EO-008. **MISSING** |
| DEF-CLOSED-001 | P1→fixed | President lacked `audit:view` for Evidence API | Fixed 2026-08-09: `RolePermissionMap` grants `AuditView` to AssemblyPresident |

---

## Not defects — certification gaps (tracking)

| Item | Classification |
|------|----------------|
| LiveKit human A/V | MANUAL ACCEPTANCE REQUIRED / NOT TESTED |
| 8-user browser / human assembly | NOT TESTED |
| 300-participant scale | NOT TESTED |
| Full EO-010 adversarial matrix | PARTIAL (existing Security/Integration/E2E only) |

These are gate blockers for **unconditional** GO, not logged as open P0/P1 code defects until reproduced failures exist.
