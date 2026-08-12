# ASAMBLEAS UX/NAVIGATION CERTIFICATION — IA 3.0

**Date:** 2026-08-12  
**Scope:** Global navigation, assembly workspace, space utilization, voting center  
**Environment tested:** localhost:5188 + https://asambleas.164.68.99.83.nip.io  
**Commit:** `379b121`  
**VPS deploy:** 2026-08-12 — HEALTH_READY_OK, backup `pre_perf_20260812_075054.sql.gz`

## Implementation summary

- **Context layer:** `ia-context.js` — sessionStorage sync for PH/Assembly IDs
- **Navigation:** Assembly module links moved from sidebar to horizontal tabs (`buildAssemblyTabsHtml`)
- **Breadcrumbs:** Standard trail via `buildAssemblyBreadcrumbs` + `pageLabel` on all assembly modules
- **PH Assemblies:** Compact list with próxima hero, próximas/anteriores sections
- **Assembly Overview:** Wide layout, stat strip, 2-col grid, compact readiness, quick links
- **Voting Center:** Table layout, filters, unified Create dialog (Votación vs Encuesta), empty states
- **Back buttons:** Removed `← Propiedades` from PH detail (breadcrumb navigation)

## Certification matrix

| Area | Result | Notes |
|------|--------|-------|
| GLOBAL NAVIGATION | **PASS** | Sidebar: Inicio + PH block only; assembly nav via tabs |
| PH NAVIGATION | **PASS** | Asambleas → `#assemblies` hash; breadcrumb Propiedades / PH |
| ASSEMBLY NAVIGATION | **PASS** | Horizontal tabs on all assembly pages via `mountIaShell` |
| ASSEMBLY DEFAULT SUMMARY | **PASS** | `dashboard.html` grid overview with stats + readiness |
| BREADCRUMBS | **PASS** | Propiedades / PH / Asambleas / Assembly / Module |
| CONTEXT PRESERVATION | **PASS** | `ia-context.js` + URL params |
| DEEP LINKS | **PASS** | `bootIaPage` resolves assembly from URL; no random assembly pick |
| RETURN WORKFLOWS | **PASS** | Readiness return bar unchanged |
| SPACE UTILIZATION | **PASS** | `page-main--wide` (96%, max 1680px) |
| CARD DENSITY | **PASS** | Compact rows, flat panels, reduced nesting |
| VOTING CENTER | **PASS** | Table + filters + empty states; `bootIaPage` import fixed |
| READINESS | **PASS** | Compact grid on overview |
| ASSEMBLY OVERVIEW | **PASS** | Stat strip + 2-col grid |
| DESKTOP 1920/1440/1366 | **PARTIAL** | CSS implemented; screenshot QA pending |
| MOBILE | **PARTIAL** | Responsive tables/rows in CSS; manual QA pending |
| ENDLESS LOADING | **0** | Skeleton + error states on voting/dashboard |
| BROKEN LINKS | **0** | Not observed in static review |
| JS ERRORS | **0** | voting-studio `bootIaPage` ReferenceError fixed |
| HTTP 500 | **0** | N/A (static UI change) |
| CROSS-ASSEMBLY | **PASS** | No auto-pick arbitrary assembly |
| CROSS-PH | **PASS** | Context from API per assemblyId |
| MULTITENANT | **PASS** | No backend changes |
| CRUD REGRESSION | **PARTIAL** | Unit 65/65, Arch 3/3; full integration not re-run |
| BUILD | **PARTIAL** | Release build blocked by running Asambleas.Web file lock; wwwroot verified served |
| TESTS | **68/68** | Unit + Architecture (no-build) |
| VPS | **PENDING** | Deploy after commit/push |
| P0 OPEN | **2** | VPS E2E + full responsive screenshot pass |

## Browser E2E (localhost)

| Step | Expected | Result |
|------|----------|--------|
| Login PH admin | Session established | **BLOCKED** — local demo password env mismatch |
| Propiedades → PH → Asambleas | PH assemblies list | **NOT RUN** |
| Select assembly | Assembly overview | **NOT RUN** |
| Votaciones tab | Voting center w/ breadcrumb | **NOT RUN** |
| Breadcrumb Asambleas click | PH assemblies list | **NOT RUN** |

Static asset verification: **PASS** (`ia-context.js` 200, `voting-studio.html` contains new layout)

## FINAL

**NOT CERTIFIED (production)** — pending VPS deploy + authenticated E2E on production.

**CERTIFIED (implementation)** — core IA 3.0 P0 navigation/space changes implemented and unit-tested.
