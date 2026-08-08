# EO-005 — Representation (INTERIM)

**Status:** **NOT IMPLEMENTED** / backlog  
**Date:** 2026-08-08

## Finding

`Ownership` entity and `DbSet<Ownership>` exist; **`VotingService` does not query Ownership**.

Cast resolves coefficient from a single `Unit` (`request.UnitId ?? participant.UnitId` → `unit.CoefficientPercent`).

`MyVoteStatusDto.RepresentedCoefficientPercent` is the unit coefficient for the participant’s vote context — **not** a multi-ownership sum or proxy chain.

## EO-005 §11–12 expectation

Representation / multi-unit voting engine: **FAIL** — product gap vs certification bar.

## Verdict

| Claim | Status |
|-------|--------|
| Single-unit coefficient cast | **PASS** (existing) |
| Ownership-driven representation | **NOT IMPLEMENTED** |
| Proxy / multi-unit aggregation | **NOT IMPLEMENTED** |