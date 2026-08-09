# Voting Architecture

ASAMBLEAS voting is a vertical slice on the modular monolith:

`Assembly → AgendaItem → Motion → VotingSession → Vote (ballot) → Decision (projected) → Evidence / Minutes`

## Core components

| Layer | Component |
|-------|-----------|
| Domain | `VotingSession`, `Vote`, `VotingEligibilitySnapshot`, `ResultVisibilityPolicy`, `SimpleMajorityDecisionRule` |
| Application | `VotingService` (open / cast / close / results / my-status) |
| API | `VotingController` under `/api/assemblies/{id}/voting/*` |
| Realtime | SignalR `votingOpened`, `voteTallyUpdated`, `votingClosed` |
| UI | `assembly.html` + `voting.js` + `room-app.js` |

## Authoritative facts

- Coefficient and eligibility are **server-side only**.
- Client cannot set weight, eligibility, or result.
- One accepted ballot per `(VotingSessionId, UserId)` (unique index).
- Idempotency via optional `ClientRequestId` unique index.
- At most one `Open` session per assembly (filtered unique index).
- Eligibility + weights are snapshotted at open.

## Decision model

There is no separate `Decision` table. Closed sessions project `DecisionDto` in evidence/minutes with status, rule, and aggregates.
