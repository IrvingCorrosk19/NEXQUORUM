# EO-005 — Domain Model (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08  
**Authority:** PostgreSQL + Application services; UI presents state.

## Entities (voting slice)

| Entity | Role | Evidence |
|--------|------|----------|
| `VotingSession` | Draft \| Open \| Closed; `HidePartialResults`; snapshots `AppliedDecisionRule`, `DecisionStatus` | `VotingSession.cs`, migration `EO005_VotingIntegrity` |
| `Vote` | Choice + server `CoefficientPercent` + `EvidenceId` + optional `ClientRequestId` | `VotingAuditConfigurations`; unique `(VotingSessionId, UserId)` |
| `Motion` | Status → Voting → Approved\|Rejected on close | `VotingService.CloseSessionAsync` |
| `Unit` | Source of coefficient | `Unit.CoefficientPercent` → vote copy |
| `Ownership` | Exists in schema | **Unused** by `VotingService` — see `03-REPRESENTATION.md` |

## Hardening deltas (this pass)

- `DomainException.Code` — stable machine codes (`DomainException.cs`).
- `VotingCodes` — eligibility / integrity vocabulary.
- `Vote.ClientRequestId` + filtered unique index.
- Session rule/decision snapshot columns.

## Not in domain (honest)

- Multi-unit representation / proxy engine.
- Pluggable decision-rule registry beyond injected `IDecisionRule` (demo: `SimpleMajority`).

## Verdict

**PASS** for hardened single-unit cast/close model. **FAIL** for full EO-005 representation domain.