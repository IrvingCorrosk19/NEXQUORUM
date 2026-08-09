# Voting Evidence

Evidence package (`AssemblyEvidenceService`) includes:

- Closed voting sessions + aggregates
- Projected decisions (`DEC-YYYY-NNNN`)
- Audit timeline (`VOTING_OPENED`, `VOTE_CAST` without choice, `VOTING_CLOSED`, `RESULT_CALCULATED`)
- Eligibility basis via session `EligibleVoters` / `EligibleCoefficient` and snapshot table

Minutes incorporate motion, question, method/rule, participation, aggregated result, decision, timestamps — without per-owner choices.
