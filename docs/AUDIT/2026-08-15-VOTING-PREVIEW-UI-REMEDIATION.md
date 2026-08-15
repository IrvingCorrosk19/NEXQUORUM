# ASAMBLEAS — Voting Preview UI Remediation

**Date:** 2026-08-15  
**Environment:** `https://localhost:7188` (Development)  
**Scope:** Frontend only (HTML / CSS / JS)

## Problema original

La vista previa en **Votaciones → Crear/Editar → Vista previa** era funcional pero visualmente deficiente:

- El marco de preview usaba fondo claro (`#eef6f5` → blanco) mientras heredaba tokens de texto del tema oscuro (`--text-primary` claro), provocando **contraste extremo / texto casi invisible**.
- El método se mostraba como código crudo (`Coefficient`) en lugar de la etiqueta de UI en español.
- Las opciones parecían botones HTML sin diseño; sin jerarquía, device frames reales ni segmented control premium.
- Modal estrecho, poco profundidad, y desalineado del design system ASAMBLEAS.

## Archivos modificados

### Frontend

- `src/Asambleas.Web/wwwroot/voting-studio.html` — estructura del modal (header, subtitle, close X, segmented devices, footer)
- `src/Asambleas.Web/wwwroot/css/voting-studio.css` — rediseño completo del modal + device frame + tarjeta participante + opciones
- `src/Asambleas.Web/wwwroot/js/modules/voting-studio-app.js` — markup de preview, labels ES del método, interacción simulada de opciones, cierre (X / footer / overlay)

### Tests / evidencia

- `tools/e2e/voting-preview-ui-e2e.cjs`
- `tools/e2e/voting-preview-results/` (screenshots + `results.json`)

## Backend

`BACKEND CHANGES: NONE`

(Ningún controller, service, contrato, entidad, migración o SignalR fue modificado para esta remediación.)

## Desktop

**PASS** — frame ~920px, título legible (`rgb(11,18,32)` sobre blanco), método «Por coeficiente», grid 3 opciones.

## Tablet

**PASS** — frame 768px, layout 2+1 opciones, segmented control activo.

## Mobile

**PASS** — frame ~402px, opciones en columna full-width, notch de dispositivo, sin overflow horizontal del modal en viewport 390×844.

## Accessibility

**PASS** — contraste AA del título; `aria-labelledby` / `aria-describedby`; close `aria-label`; devices `aria-pressed`; focus visible; Escape; touch targets ≥44px en controles del modal.

## Console

**PASS** — `0` errores JavaScript nuevos en la corrida E2E.

## Network

**PASS** — `0` 4xx/5xx atribuibles a la corrección de preview.

## Build

**PASS** — `dotnet build src/Asambleas.Web/Asambleas.Web.csproj -c Release` → 0 errores (1 warning ASPDEPR005 preexistente en `Program.cs`, no relacionado).

## Evidencia

- E2E: `node tools/e2e/voting-preview-ui-e2e.cjs` → **LOCAL CERTIFIED**
- Screenshots:
  - `tools/e2e/voting-preview-results/preview-desktop.png`
  - `tools/e2e/voting-preview-results/preview-tablet.png`
  - `tools/e2e/voting-preview-results/preview-mobile.png`
  - `tools/e2e/voting-preview-results/preview-host-mobile-390.png`
- Caso extremo: título largo de presupuesto 2026 sin romper layout.

## Resultado

`LOCAL CERTIFIED`
