# Voting Concurrency

- `ConcurrencyStamp` (Guid) on Motion and VotingSession
- Clients send `expectedConcurrencyStamp` on update/withdraw/cancel
- Mismatch → `CONCURRENCY_CONFLICT`
- Withdraw/cancel re-count ballots server-side before commit (first-vote race → lock)
