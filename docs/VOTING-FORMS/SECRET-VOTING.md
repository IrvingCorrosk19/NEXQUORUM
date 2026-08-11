# Secret Voting

Honest classification of current architecture:

**Level: PSEUDONYMOUS (operational secrecy)**

- UI/API/audit omit choice from public broadcasts and VoteCast audit metadata.
- DB `votes` table still stores `UserId` + `Choice` for integrity / recount.
- Receipts expose evidence id, not choice.

Not STRONG SECRET (no cryptographic unlinkability / no separate eligibility token without recoverable choice).
