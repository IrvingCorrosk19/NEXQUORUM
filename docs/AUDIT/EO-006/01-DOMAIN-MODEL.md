# EO-006 — Domain Model

**Source of truth**

| Concept | Authority |
|---------|-----------|
| Unit coefficient | `Unit.CoefficientPercent` (decimal 7,4) |
| Ownership share | `Ownership.SharePercent` (eligibility; coeff from Unit) |
| Power / proxy | `Power` (assembly-scoped, status Approved) |
| Effective representation | `AssemblyRepresentation` snapshot at accreditation |
| Accreditation | `AssemblyParticipant.IsAccredited` + AccreditedAt/By |
| Presence | `AttendanceStatus` (CheckedIn/Present/TempDisc/Left) |
| Quorum | `QuorumService` → `QuorumEngine` over active representations |
| Threshold | `Assembly.RequiredQuorumPercent` |
| Voting weight | `IAssemblyRepresentationService` effective sum |

**Person ≠ Unit:** one user may own/represent many units via Ownership + Power → multiple `AssemblyRepresentation` rows.

**Unit ≠ Person:** unique filtered index `(AssemblyId, UnitId) WHERE IsActive` prevents double count.
