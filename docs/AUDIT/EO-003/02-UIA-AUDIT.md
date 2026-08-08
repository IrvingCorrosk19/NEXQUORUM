# EO-003 UIA Audit — Implementation Debt (INTERIM)

**Date:** 2026-08-08  
**Scope:** CSS/JS architecture for Assembly UI; FUNCTIONALITY FREEZE.

## Design tokens progress

| Area | Status |
|------|--------|
| `wwwroot/css/tokens.css` Design System V2 | **DONE** — semantic surfaces, text, status, assembly, motion, z-index |
| Legacy `--color-*` aliases | **DONE** — mapped to V2 for compatibility |
| `components.css` / `assembly-room.css` / `projector.css` consuming tokens | **PARTIAL → GOOD** — majority of new chrome uses `var(--surface-*)`, `var(--status-*)`, `var(--assembly-*)` |
| Hardcoded hex outside tokens | **REMAINING** — some `color-mix` fallbacks and legacy literals in older rules |
| `prefers-reduced-motion` zeros motion tokens | **DONE** |

## Remaining inline styles

Counts of `style=` occurrences (HTML + JS modules under `wwwroot`):

| File | Count | Notes |
|------|------:|-------|
| `assembly.html` | 5 | Layout scaffolding |
| `index.html` | 4 | Login layout |
| `lobby.html` | 4 | Device preview scaffolding |
| `dashboard.html` | 3 | Prep layout |
| `agenda.js` | 4 | Dynamic panel bits |
| `minutes-app.js` | 4 | Raw presentation helpers |
| `evidence-app.js` | 3 | Raw presentation helpers |
| `voting.js` | 3 | Dynamic widths / ceremony bits |
| `quorum.js` | 2 | Metric visuals |
| Other pages (`checkin`, `projector`, `minutes`, `evidence`) | 1 each | Minor |

**Debt:** Inline styles still concentrate in lobby/login shell and minutes/evidence/agenda renderers. Prefer class + tokens next polish pass.

## JS module sizes (approx.)

| Module | Size | Risk |
|--------|-----:|------|
| `room-app.js` | ~17 KB | Highest — DOM-coupled orchestration |
| `voting.js` | ~10.6 KB | Ceremony + tally |
| `dashboard-app.js` | ~8.6 KB | OK |
| `checkin-app.js` | ~5.4 KB | OK |
| `lobby-app.js` | ~5.3 KB | OK |
| `projector-app.js` | ~5.3 KB | OK |
| `speakers.js` | ~4.1 KB | OK |
| `minutes-app.js` / `evidence-app.js` | ~2.7 KB each | Thin but presentationally raw |

**Note:** Inventory cited `room-app.js` ~15 KB; now ~17 KB after role chrome / empty-state / priority wiring — still a hotspot for split later (not this freeze).

## CSS bundle footprint

| File | Size |
|------|-----:|
| `components.css` | ~19 KB |
| `assembly-room.css` | ~12 KB |
| `tokens.css` | ~5 KB |
| `projector.css` | ~3 KB |
| `base.css` | ~2 KB |

## Duplicated patterns (still present)

1. **Empty-state HTML** — WHAT/WHY/NEXT strings built in `room-app.js`, `speakers.js`, `voting.js`, `meeting.js` (shared markup pattern, not yet a single helper everywhere).
2. **Status/chip classes** — dashboard readiness vs room quorum chip share semantics but separate markup.
3. **Role gating** — CSS `[data-role]` + `applyRoleChrome()`; keep both in sync manually.
4. **Minutes/Evidence** — parallel thin apps with similar fetch→`<pre>` pattern.

## UIA score (honest)

| Dimension | BEFORE | AFTER |
|-----------|-------:|------:|
| Token single source | 35 | 78 |
| Inline style hygiene | 40 | 52 |
| Module cohesion | 45 | 55 |
| Pattern reuse | 40 | 58 |
| **Overall UIA** | **40** | **61** |

Tokens moved the needle; structural debt (inline, `room-app` size, minutes/evidence) remains.
