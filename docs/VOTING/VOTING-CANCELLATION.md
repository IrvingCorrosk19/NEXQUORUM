# Voting Cancellation

`POST /api/assemblies/{id}/voting/{sessionId}/cancel`  
Body: `{ reason, expectedConcurrencyStamp? }`

- Reason required (≥5 chars)
- Session → Cancelled; votes kept
- Motion → Cancelled if ballots > 0, else Presented
- SignalR `votingCancelled` (no choice leakage)
