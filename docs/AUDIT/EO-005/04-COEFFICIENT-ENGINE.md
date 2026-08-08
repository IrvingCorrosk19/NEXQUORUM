# EO-005 — Coefficient Engine (INTERIM)

**Status:** INTERIM — NOT CERTIFIED  
**Date:** 2026-08-08

## Authority

Server copies `Unit.CoefficientPercent` onto `Vote.CoefficientPercent` at cast (`decimal(7,4)`). Client never supplies weight.

## Tally

Close/results sum coefficients by `VoteChoice`; also emit **vote counts** (`InFavorVotes` / `AgainstVotes` / `AbstentionVotes`) — UI shows both (`voting.js` `resultRow`).

## Decision input

`IDecisionRule.Decide(inFavor, against, abstention)` uses **coefficient sums**, not headcount (`SimpleMajorityDecisionRule`).

## Gaps

- No ownership-weighted multi-unit rollup (see `03-REPRESENTATION.md`).
- No dedicated coefficient reconciliation audit beyond vote row + RESULT_CALCULATED metadata.

## Tests

Unit decision-rule tests use decimal coefficients — **PASS** (suite). Scale (100 simulated votes): **NOT EXECUTED**.

## Verdict

Single-unit server-derived coefficient: **PASS**. Full coefficient/representation engine: **FAIL** (incomplete vs EO-005 representation).