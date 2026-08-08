# EO-003 Visual Regression (INTERIM)

**Date:** 2026-08-08  
**Dirs:** `docs/AUDIT/EO-003/BEFORE/`, `docs/AUDIT/EO-003/AFTER/`

## Folder status

| Folder | Status | Contents |
|--------|--------|----------|
| `BEFORE/` | **Partial population** | 5 PNGs (see below) |
| `AFTER/` | **Empty — needs population** | 0 files |

### BEFORE files present

| File | Notes |
|------|-------|
| `01-login.png` | Login baseline |
| `eo3-before-login.png` | Duplicate/alternate login capture |
| `eo3-before-dashboard.png` | Dashboard baseline |
| `eo3-before-checkin.png` | Check-in baseline |
| `eo3-before-lobby.png` | Lobby baseline |

### Missing BEFORE coverage

- Assembly room (operator)
- Assembly room (owner)
- Voting open / receipt
- Projector
- Minutes / Evidence
- Mobile 390 owner sticky vote
- Reconnect banner

### AFTER coverage

**None.** Capture after V2 tokens + hierarchy + sticky voting + projector typography before claiming visual delta.

## Playwright snapshots

| Item | Status |
|------|--------|
| Visual regression Playwright snapshots | **PARTIAL** historically; not completed this pass |
| Disk space for multi-browser | Historically constrained |
| 8-browser contexts | **NOT EXECUTED** |

## Process recommendation (next)

1. Populate `AFTER/` with same routes/viewports as BEFORE (+ room/vote/projector).
2. Side-by-side in `10-BEFORE-AFTER.md` once files exist.
3. Add Playwright snapshot suite when disk allows — do not fake green.

## Visual regression gate

| Gate | Status |
|------|--------|
| BEFORE baseline usable | PARTIAL |
| AFTER populated | **FAIL** (empty) |
| Diff reviewed | **NOT EXECUTED** |
| Automated snapshot CI | **NOT EXECUTED** |

**Do not treat EO-003 visuals as regression-certified.**
