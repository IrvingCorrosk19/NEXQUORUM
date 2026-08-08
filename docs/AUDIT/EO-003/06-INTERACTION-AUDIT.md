# EO-003 Interaction Audit (INTERIM)

**Date:** 2026-08-08  
**Rule:** FUNCTIONALITY FREEZE — ceremony and critical-action clarity only.

## Voting ceremony

| Step | Behavior | Status |
|------|----------|--------|
| 1. SELECT | Choice cards in vote panel | Improved |
| 2. Review | Explicit confirm/review button before commit | Improved |
| 3. Confirm dialog | Dialog restates choice (`aria-live`) | Improved |
| 4. Receipt | Post-vote receipt surface | Improved |
| Failure | Human-readable failure copy (not raw exception dump) | Improved |
| Owner mobile | Sticky panel while voting open | Code intent; device **MANUAL ACCEPTANCE REQUIRED** |
| Multi-user simultaneous vote UI | 8-browser / stress | **NOT EXECUTED** |

**Score:** BEFORE 44 → AFTER 76 (ceremony logic/UI); certification incomplete.

## Control hierarchy (critical actions)

| Action | BEFORE | AFTER |
|--------|--------|-------|
| End / Cerrar asamblea | Same weight as Pause | `btn-danger` separated |
| Meta actions (logout / secondary) | Competed with primary | Ghost styling |
| Start / Pause / Vote / Speakers | Mixed row cognitive load | Clearer hierarchy; still dense |
| Pedir la palabra | Visible to operator incorrectly | Owner-only + `applyRoleChrome` |

## Adaptive priority

| Attribute | Effect |
|-----------|--------|
| `data-voting="open\|idle"` | Drives sticky owner voting + panel emphasis |
| `data-priority="voting\|speaker\|…"` | Elevates vote panel / stage cue |

## Reconnect

| Aspect | Status |
|--------|--------|
| Connection banner | Present (`aria-live`) |
| REST rehydrate / SignalR | Wired from EO-002 |
| Forced disconnect visual polish | Incomplete |
| Operator stress under reconnect | **NOT EXECUTED** |

## Quorum / speakers micro-interactions

- Quorum metric animation + required label — improved presence.
- Speaker queue numbered with wait times — improved fairness cue.
- Empty states WHAT/WHY/NEXT + compact empty motion — reduced panel thrash.

## LiveKit / media

| Interaction | Status |
|-------------|--------|
| Join with A/V | **BLOCKED** (no credentials) |
| Technical EN → human ES copy | Done where wired |
| Video stage waiting without AV | Still dominates visually |

## Critical-action matrix

| Action | Confirm needed? | Implemented? | Browser-proven? |
|--------|-----------------|--------------|-----------------|
| Cast vote | Yes (dialog) | Yes | PARTIAL |
| End assembly | Should be hard to miss/mis-tap | Danger styling | PARTIAL |
| Start assembly | Primary | Yes | PARTIAL |
| Request speak | Owner only | Yes | PARTIAL |
| Accredit participant | Explicit button | Yes | PARTIAL (EO-002 era) |

## Interaction score (honest)

| Flow | BEFORE | AFTER |
|------|-------:|------:|
| Voting ceremony | 44 | 76 |
| Role-correct controls | 35 | 78 |
| Reconnect trust | 50 | 64 |
| Operator critical actions | 42 | 72 |
| **Overall** | **43** | **72** |
