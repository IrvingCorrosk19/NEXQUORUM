# EO-005 — Voting AS-IS Assessment

**Date:** 2026-08-08  
**App:** `http://localhost:5188` (Healthy)  
**Method:** Code + schema + existing tests audit (harden, do not rewrite)  
**Principle:** Backend + PostgreSQL are authority; frontend presents state.

---

## 1. Verdict

The EO-001/002 voting vertical slice is **real and partially strong**:

| Strength | Evidence |
|----------|----------|
| Server-derived coefficient | `Unit.CoefficientPercent` → `Vote.CoefficientPercent` (`decimal(7,4)`) |
| Unique vote constraint | `IX_votes_VotingSessionId_UserId` UNIQUE |
| Double-vote app check | Integration test `Cast_vote_persists_and_double_vote_fails` |
| Secret partials default | `HidePartialResults=true`; choice omitted from `VOTE_CAST` audit + receipt |
| Decision rule isolated | `IDecisionRule` / `SimpleMajorityDecisionRule` |
| Select ≠ cast in UI | Confirm dialog before POST |

It is **not yet EO-005 certified**. Critical gaps: concurrency race mapping, idempotency key, eligibility semantic codes, representation engine, rule snapshot, dedicated vote-status, server end-while-open, 8-user Playwright.

---

## 2. Domain (existing)

```text
VotingSession  Draft | Open | Closed   (Draft enum unused in open path)
Vote           Choice + CoefficientPercent + EvidenceId + CastAtUtc
Motion         Status → Voting → Approved|Rejected on close
```

**Representation entity for voting:** NOT FOUND (`Ownership` exists but unused by `VotingService`).

---

## 3. CastVote AS-IS flow

```text
Auth → Tenant → Session Open → Participant → Attendance gate
→ App AnyAsync(already voted) → Load unit coefficient → Insert
→ Audit (no Choice) → optional SignalR tally → Receipt
```

**Missing:** transaction wrapper, `DbUpdateException` → semantic duplicate, `ClientRequestId`, eligibility codes.

---

## 4. Gap backlog (priority)

| P0 | Gap | Risk |
|----|-----|------|
| P0 | Concurrent cast race → unhandled 500 | Integrity UX / possible confusion |
| P0 | No idempotency key | Retry ambiguity |
| P0 | Eligibility = free-text DomainException | Frontend cannot branch safely |
| P0 | Complete assembly while voting open (server) | Frontend-only guard |
| P1 | No GET my-vote-status machine | Unknown-outcome recovery incomplete |
| P1 | No decision rule snapshot on session | Historical explainability weak |
| P1 | Representation / multi-unit | Product gap vs EO-005 §11–12 |
| P2 | Unique does not include TenantId in composite | Low (session scoped + filter) |
| BLOCKED | LiveKit | N/A to vote integrity |
| NOT EXECUTED | Playwright 8 contexts / human vote drill | Certification gate |

---

## 5. Existing tests (keep / extend)

- Unit: `SimpleMajorityDecisionRuleTests`
- Integration: `VotingTransactionTests.Cast_vote_persists_and_double_vote_fails`
- E2E: open → cast → double fail → close → results
- Security: unknown session cast fails

**Need:** concurrent cast, idempotent retry, eligibility codes, close race, secret audit assertion.

---

## 6. EO-005 approach

```text
HARDEN VotingService + DTOs + DB mapping + targeted tests
+ thin frontend eligibility/receipt recovery
+ docs matrix honest INTERIM until 8-user E2E PASS
```

No stack change. No new product modules. No client-trusted coefficient/decision.

---

## Appendix A — Progress (2026-08-08 harden pass)

**Status:** INTERIM — NOT CERTIFIED. Gaps below closed in code + targeted tests; 8-user E2E / human still open.

| Gap (from §4) | Outcome this pass |
|---------------|-------------------|
| Concurrent cast → 500 | **PASS** — `DbUpdateException` → semantic / idempotent (`VotingService`) |
| Idempotency key | **PASS** — `ClientRequestId` + filtered unique index |
| Eligibility free-text only | **PASS** — `DomainException.Code` + `VotingCodes` → ProblemDetails `code` |
| Complete while voting open | **PASS** — server `OPEN_VOTING_EXISTS` (`AssemblyService`) |
| GET my-vote-status | **PASS** — `GET …/my-status` |
| Decision rule snapshot | **PASS** — `AppliedDecisionRule` / `DecisionStatus` on close |
| Representation / multi-unit | **NOT IMPLEMENTED** — backlog |
| Playwright 8 / human | **NOT EXECUTED** |

**Evidence:** migration `EO005_VotingIntegrity`; unit 39 PASS; Voting integration 3 PASS; frontend `clientRequestId` + my-status verify + result votes/coefficient + rule disclaimer.
