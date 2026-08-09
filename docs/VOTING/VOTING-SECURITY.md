# Voting Security

## Validations on cast

Authenticated, tenant match, assembly active, session open, accredited eligibility (snapshot), allowed choice, not already voted, server coefficient, unique + idempotency constraints.

## Client cannot set

- coefficient / weight
- eligible / ownerId / unitId of another owner
- approved / result / percentages / closed status

Foreign `unitId` is ignored or rejected.

## Multitenant / IDOR

All reads/writes go through assembly + tenant guards. Cross-tenant voting session IDs fail tenant match.

## CSRF

Cookie auth uses antiforgery / same-site patterns already used by ASAMBLEAS mutators.

## Double vote

Unique `(VotingSessionId, UserId)` + conflict handling on concurrent inserts.
