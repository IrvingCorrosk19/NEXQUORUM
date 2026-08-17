# ASAMBLEAS — Operational Right Panel Responsive Certification

**Date:** 2026-08-16  
**Environment (local):** `https://localhost:7188`  
**Production:** `https://asambleas.164.68.99.83.nip.io`  
**Scope:** Frontend layout only (`assembly.html` / `assembly-room.css` / `room-app.js`)

---

## ROOT CAUSE

`syncContextPriority()` in `room-app.js` applied CSS class `is-collapsed` to idle **Moción** and **Votación** sections.

CSS rule:

```css
.sidebar section.is-collapsed {
  max-height: 3.25rem;
  overflow: hidden;
}
```

Effect: section headings stayed visible while empty-state / prepare bodies were clipped — matching the reported defect (Agenda OK, Moción/Votación half-cut, Cola still below).

Secondary issues found during remediation:

1. Owner sticky `#vote-panel` collided with the fixed meeting control bar.
2. Live questionnaire lists could grow unbounded and bury other rail sections.
3. Applying `overflow` + `max-height` on the **sidebar grid item** (`section`) collapsed used height (~26px) because grid min-size resolves to 0 when overflow ≠ visible.

---

## FIX

| Change | Purpose |
|--------|---------|
| Replace collapse clipping with `is-idle` (opacity only) | Never clip operational bodies |
| Viewport-bound `.room--meeting-ux` + single `.sidebar` scroll | Correct scroll container |
| Compact `.sidebar .empty-state` / `.panel-compact-empty` | Empty ≠ giant cards |
| Soft-cap `#agenda-panel` when voting priority | Active voting stays reachable |
| Soft-cap `#vote-panel` / `#motion-panel` / questionnaire list (inner, not grid section) | Priority without burying rail |
| Disable sticky vote under meeting-ux | No toolbar overlap |
| Preserve `sidebar.scrollTop` across `refreshPanels()` | Realtime must not yank scroll |
| Cache bust `?v=panel6` | Force asset refresh |

**Backend changes:** NONE

---

## FILES MODIFIED

- `src/Asambleas.Web/wwwroot/css/assembly-room.css`
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js`
- `src/Asambleas.Web/wwwroot/assembly.html`
- `tools/e2e/right-panel-responsive-cert.cjs` (cert harness)
- `tools/e2e/right-panel-results/*` (evidence)

---

## BEFORE / AFTER

**BEFORE:** idle Moción/Votación clipped by `max-height: 3.25rem; overflow: hidden`.

**AFTER evidence (local):**

- `tools/e2e/right-panel-results/01-before-or-baseline-1366.png`
- `tools/e2e/right-panel-results/05-first-viewport-1366.png`
- `tools/e2e/right-panel-results/vp-*.png`
- `tools/e2e/right-panel-results/zoom-*.png`
- `tools/e2e/right-panel-results/results.json`

---

## VIEWPORT MATRIX

| Viewport | Result |
|----------|--------|
| 1920×1080 | PASS |
| 1600×900 | PASS |
| 1440×900 | PASS |
| 1366×768 | PASS |
| 1280×720 | PASS |

All four sections scroll-reachable (`REACH-*` assertions).

---

## ZOOM MATRIX

Simulated as Chrome-like layout viewport shrink (`base / zoom`):

| Zoom | Result |
|------|--------|
| 90% | PASS |
| 100% | PASS |
| 110% | PASS |
| 125% | PASS |

---

## TESTS

| Test | Result |
|------|--------|
| Empty / idle states | PASS |
| Full content (agenda + motion + voting + queue) | PASS |
| Vertical scroll (last section reachable) | PASS |
| Horizontal scroll | PASS (0) |
| Realtime scroll preserve | PASS |
| Clipping (`overflow:hidden` trap / no-scroll bury) | **0** |
| Overlaps (sections + sidebar↔toolbar) | **0** |
| Build Release | PASS (0 errors) |

---

## REGRESSION (smoke — no module changes)

Camera / Mic / Screen share / Recording / Voting / Quorum / Presence: not reworked; layout-only change. Media banners in screenshots are pre-existing device-permission noise in headless cert, not introduced by this fix.

---

## COMMIT / PUSH / VPS

| Step | Result |
|------|--------|
| COMMIT | `d32444f` — `fix(assembly): prevent operational panel clipping` |
| PUSH | PASS → `origin/master` |
| VPS DEPLOY | PASS — image rebuilt from `d32444f` archive; `assembly-room.css?v=panel6` + `.is-idle` present in container |
| PRODUCTION | PASS — assembly `0f004785-58f1-47f5-bda3-c022fdabece4`; clipped=0; all four sections reachable; evidence `tools/e2e/right-panel-results/production-final-1366.png` |

**Operational note (not a backend code change):** after Ocean assembly wipe, demo seeder crashed on missing `powers.AssemblyId` FK. VPS `docker-compose.yml` was set to `Demo__SeedUsers: "false"` so the web container could boot with the already-built frontend image. Demo password login remains available.

---

## FINAL STATUS

**ASSEMBLY OPERATIONAL PANEL — PRODUCTION CERTIFIED**

