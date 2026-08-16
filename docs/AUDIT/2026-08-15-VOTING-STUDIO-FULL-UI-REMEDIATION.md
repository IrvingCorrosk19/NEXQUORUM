# ASAMBLEAS — Voting Studio Full UI/UX Remediation

**Date:** 2026-08-15  
**Environment:** `https://localhost:7188` (Development)  
**Scope:** Frontend only

## Root cause

En `voting-studio.css` los controles del editor usaban `background: #fff` **sin** `color`.  
`base.css` aplica `input, select { color: inherit }`, heredando `--text-primary` claro del dark theme.

Resultado: **inputs blancos + texto casi blanco** → ilegibles (selects, textareas, opciones).

Causa secundaria de layout: `.ia-voting-layout.has-editor` repartía ~50/50 listado/editor, comprimiendo el formulario.

## Before

- Controles claros con texto del tema oscuro (contraste FAIL)
- Formulario plano sin jerarquía ni grupos de configuración
- Option rows con ✕ flotante poco accesible
- Vista participante inline sobre fondo blanco ilegible
- Preview modal ya remedado (vs3) se preservó

## After

- Controles dark-theme (`#0d1524` / `#e8eef8`) alineados al design system `.field`
- Jerarquía: Contenido (Pregunta dominante) + Configuración agrupada (Contexto / Votación / Decisión / Resultados)
- Option editor con filas compactas + `aria-label` en eliminar
- Umbral % deshabilitado visualmente cuando no aplica `QualifiedMajority` (solo UI)
- Action bar sticky
- Layout editor priorizado al abrir el studio
- Preview regression PASS

## Archivos modificados

### Frontend

- `src/Asambleas.Web/wwwroot/voting-studio.html`
- `src/Asambleas.Web/wwwroot/css/voting-studio.css`
- `src/Asambleas.Web/wwwroot/css/ia.css`
- `src/Asambleas.Web/wwwroot/js/modules/voting-studio-app.js`

### Tests / evidencia

- `tools/e2e/voting-studio-full-ui-e2e.cjs`
- `tools/e2e/voting-studio-full-results/` (screenshots + results.json)

## Backend

`BACKEND CHANGES: NONE`

## Resoluciones probadas

- 1440×900, 1366×768, 768×1024, 390×844

## E2E

`node tools/e2e/voting-studio-full-ui-e2e.cjs` con `ASAMBLEAS_BASE_URL=https://localhost:7188` → **LOCAL CERTIFIED**

Gates: contrast, create, options, threshold conditional, save, edit, preview regression, responsive, console, network.

## Console

PASS — 0 errores JS nuevos

## Network

PASS — 0 4xx/5xx atribuibles

## Build

PASS — `dotnet build src/Asambleas.Web -c Release` → 0 errores

## Resultado

`LOCAL CERTIFIED`
