# ASAMBLEAS — UX/UI/IA PRODUCTION CERTIFICATION

Date: 2026-08-11  
Environment: https://asambleas.164.68.99.83.nip.io  
Scope this pass: Finish IA chrome on **all admin/operator modules** (shared `bootIaPage` / `#ia-nav`), Spanish label sweep, VPS static deploy + Playwright spot-check.

## Delivered this pass

- Shared bootstrap: `js/modules/ia-page.js` + contextual nav `ia-nav.js` (Propiedades → PH → Asamblea → Histórico)
- Wired IA shell on: PH, Calendario, Histórico, Dashboard/Resumen, Comunicaciones, Convocatoria, Acreditación, Sala (previa), Votaciones, Acta, Evidencias, Expediente, Owner portal
- Live room (`assembly.html`) remains dedicated shell (by design); CTA label “Votaciones”
- Spanish: Acreditación (not Check-in), Previa de sala (not Lobby), Studio → Votaciones
- Null-safe legacy `#nav-*` / `#link-*` assignments after static nav removal
- Static deploy into `asambleas_web` wwwroot + host tree under `/opt/apps/asambleas`

## Scorecard

```
=========================================================
ASAMBLEAS — UX/UI/IA PRODUCTION CERTIFICATION
=========================================================

SCREENS AUDITED: 12+
SCREENS REDESIGNED (IA chrome): PASS (all listed modules)
NAVIGATION DUPLICATION: reduced (contextual #ia-nav; PH ops wizard/tabs already gated)
VISIBLE GUIDS: 0 observed on spot-check
RAW TECHNICAL ENUMS: reduced; residual status badges may remain
PH / OWNER / UNIT / ASSEMBLY CRUD MATRIX: NOT RE-RUN this pass
SAVE / DIRTY / FILTER / OWNER DRAWER: prior PH pass (partial)
EMPTY STATES / LOADING / ROLE UX: PARTIAL
OWNER RBAC / CROSS-PH / CROSS-TENANT: NOT RE-RUN
DESKTOP SPOT: PASS (Playwright — #ia-nav links present on all modules)
LAPTOP 1366 / TABLET / MOBILE: FAIL (not certified)
ACCESSIBILITY: PARTIAL
CONSOLE ERRORS: zero pageerrors on module spot-check (expediente fixed)
LOCAL BROWSER E2E: PARTIAL
RELEASE BUILD: NOT RUN this pass
TESTS: n/a this pass
SECURITY: NOT RE-RUN
COMMIT: NOT DONE (P0 remain — no false “certified” commit)
PUSH: NOT DONE
DEPLOY VPS: PASS (static IA assets)
VPS HEALTH / HTTPS: PASS
VPS BROWSER E2E: PASS spot (12 modules; nav counts 3–18)

P0 OPEN: 6
  1) Full visual redesign density (not only IA chrome)
  2) CRUD matrix + DB cross-check
  3) Role UX separation polish
  4) Mobile / 1366 QA
  5) Build/test gate + commit/push policy
  6) Security regression suite re-run

P1 OPEN: design-system unification; live room IA breadcrumbs optional

FINAL: NOT CERTIFIED
=========================================================
```

## Playwright spot-check (president@ocean.demo)

| Module | `#ia-nav` links | Notes |
|--------|-----------------|-------|
| PH | 3 | list/global |
| Calendario / Histórico | 9 | global+PH |
| Dashboard…Expediente | 18 | assembly workspace |
| Expediente | fixed | was blocked by missing `#page-title` |

## Honest note

IA navigation is now consistent across modules on VPS. This is **not** full PRODUCTION CERTIFIED DoD (CRUD, mobile, security, release build, commit/push).
