# EO-003 Known Issues (INTERIM)

**Date:** 2026-08-08  
**Do not treat as empty backlog — these block certification.**

## Blockers

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| K1 | LiveKit A/V blocked — no credentials | P0 product demo | **BLOCKED** |
| K2 | Playwright 8-browser contexts not run | P0 evidence | **NOT EXECUTED** |
| K3 | Operator stress / 8-user realtime visual test | P0 evidence | **NOT EXECUTED** |
| K4 | Full WCAG AA formal audit | P0 compliance claim | **NOT EXECUTED** |

## High debt (not done this pass)

| ID | Issue | Severity | Notes |
|----|-------|----------|-------|
| K5 | Minutes / Evidence largely raw JSON/`<pre>` | P1 | Admin dump, not premium |
| K6 | Participant drawer not implemented | P1 | `--z-drawer` reserved only |
| K7 | Visual regression AFTER folder empty | P1 | Cannot prove delta |
| K8 | Visual Playwright snapshots incomplete | P1 | Partial historically |
| K9 | BEFORE screenshots incomplete (no room/vote/projector) | P2 | Partial baseline |

## Responsive / acceptance gaps

| ID | Issue | Status |
|----|-------|--------|
| K10 | Owner sticky voting — device certify | **MANUAL ACCEPTANCE REQUIRED** |
| K11 | Tablet check-in grid speed | **MANUAL ACCEPTANCE REQUIRED** |
| K12 | Landscape room chrome | **NOT fully verified** → **MANUAL ACCEPTANCE REQUIRED** |
| K13 | Projector hall-distance QA | **MANUAL ACCEPTANCE REQUIRED** |

## Residual UX (improved but imperfect)

| ID | Issue | Notes |
|----|-------|-------|
| K14 | Login still form-template / weak brand hero | Score ~62 |
| K15 | Dashboard secondary links crowded | CTA fixed; density remains |
| K16 | Check-in focus ring hierarchy weak | Cards vs primary |
| K17 | Lobby inline styles | Debt in `02-UIA-AUDIT` |
| K18 | `room-app.js` ~17 KB DOM-coupled | Hotspot |
| K19 | Video stage “waiting” dominates without AV | Expected while K1 blocked |
| K20 | Reconnect overlay polish incomplete | Banner exists |
| K21 | Vote results still basic bars | Ceremony better; premium results pending |
| K22 | Duplicate empty-state markup across modules | Pattern debt |

## Explicit non-claims

- EO-003 is **not complete**.
- Do **not** claim WCAG AA.
- Do **not** claim 8-user realtime visual proof.
- Do **not** claim LiveKit production readiness.
- Do **not** claim Minutes/Evidence UI excellence.
