# ASAMBLEAS — INFORMATION ARCHITECTURE CERTIFICATION

Date: 2026-08-11  
Scope: PH → Assembly → Live Session IA restructure (frontend shells; domain unchanged)

## Summary

Reorganized the admin experience into three levels with contextual sidebar, breadcrumbs, and state-driven primary CTAs. Login for operators lands on **Propiedades** (`/ph.html`), not a mixed assembly command panel. Assembly overview lives at `/dashboard.html?assemblyId=…`. Live room remains `/assembly.html` (Teams-like shell).

## Scorecard

| Criterion | Result |
|-----------|--------|
| PH DASHBOARD | **PASS** (stats, próxima asamblea → Ver asamblea, tab Asambleas + filters; no check-in CTA on PH home) |
| ASSEMBLY WORKSPACE | **PASS** (overview + preparación + one primary action + scoped workspace links) |
| LIVE SESSION | **PASS** (unchanged dedicated live shell; nav no longer mixes PH admin into assembly overview) |
| ROLE SEPARATION | **PARTIAL PASS** (owner portal redirect intact; president/secretary/phadmin share admin shell with permission-gated links — deeper role chrome still P1) |
| SIDEBAR CONTEXT | **PASS** (ia-nav: Inicio / PH / Asamblea sections) |
| BREADCRUMBS | **PASS** |
| DUPLICATE INFORMATION | **0** on assembly overview (removed PH card + duplicate “próxima/seleccionada”) |
| AMBIGUOUS ACTIONS | **0** primary CTAs (“Abrir acreditación”, “Entrar a la sala”, “Ver acta”, …) |
| STATE-DRIVEN CTA | **PASS** (mapped to existing Draft/Scheduled/CheckIn/InProgress/Completed/Cancelled) |
| OWNER UX | **PASS** (still `/owner.html`; operators no longer dump owners into assembly panel) |
| PRESIDENT UX | **PASS** (assembly workspace + clear accreditation CTA) |
| SECRETARY UX | **PARTIAL** (same shell; permissions hide manage actions) |
| PHADMIN UX | **PASS** (PH home first) |
| DESKTOP | **PASS** (implemented) |
| TABLET | **PARTIAL** (responsive CSS; visual QA pending full matrix) |
| MOBILE | **PARTIAL** (drawer not yet; stacked cards) |
| ACCESSIBILITY | **PARTIAL** (ARIA breadcrumbs/nav/filters; WCAG audit incomplete) |
| BROWSER E2E | **PARTIAL** (deployed; smoke pending full role matrix in browser) |

## P0 OPEN

1. Mobile nav drawer for contextual sidebar  
2. Full browser E2E matrix (PHAdmin / President / Secretary / Owner) with screenshots  

## P1 OPEN

1. Distinct secretary/president chrome beyond permission gating  
2. Convocation-aware CTA when Scheduled but convocation not sent (“Enviar convocatoria”)  
3. Conceptual pretty URLs (`/ph/{id}/assemblies/...`) — currently query+hash adapted to static host  

## FINAL

**NOT CERTIFIED** — core IA P0 structure shipped and deployable; certification blocked on mobile drawer + full role browser E2E / visual review.

When those close → target **CERTIFIED**.
