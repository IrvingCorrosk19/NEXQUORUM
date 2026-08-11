# Historical integrity

Past assemblies must not mutate when master data changes.

## Frozen artifacts

| Artifact | Frozen fields |
|----------|---------------|
| `AssemblyRepresentation` | `CoefficientSnapshot` |
| `AssemblyParticipant` | `EffectiveCoefficientPercent` |
| `VotingEligibilitySnapshot` | coefficient + unit code |
| `Vote` | `CoefficientPercent` at cast |
| `QuorumSnapshot` | present/required aggregates |
| `AttendanceRecord` | UserId/UnitId at event |
| Expediente / Evidence APIs | assembled from snapshots |

## Proven

2026-08-10 local: changed Unit 101 from 14% → 50%; Ocean assembly expediente JSON and quorum payload **unchanged**. Deactivated owner101; expediente **unchanged**. Restored afterwards.
