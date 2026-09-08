# Certificación Ocean — Sala `assembly.html`

**Fecha:** 2026-09-08  
**Base:** `https://localhost:7188`  
**Script:** `tools/e2e/ocean-assembly-cert.cjs`  
**Matriz:** `tools/e2e/ocean-assembly-results/matrix.json`  
**Resultado:** **CERTIFICADO** (38 pass / 0 fail)

## 1. Diagnóstico de la implementación anterior

- Había meeting-UX funcional (LiveKit, SignalR, voto, quórum), pero no seguía la jerarquía de las plantillas Premium/Móvil.
- En teléfono el panel operativo era drawer/bottom-sheet completo; faltaban pestañas **Votación / Agenda / Personas** en el flujo principal.
- El resumen de presencia solo era para operador; el propietario no veía la tarjeta de quórum tipo plantilla móvil.
- Lenguaje y contraste de voto no alineados con Ocean (teal oscuro, opciones tipo card, confirmación).

## 2. Componentes de cada plantilla incorporados

| Plantilla | Incorporado |
|---|---|
| **Premium** | Topbar compacta, video dominante, resumen 4 métricas, panel lateral voto+agenda, barra inferior, tokens teal |
| **Móvil** | Overview + quorum card, video, tabs, contenido, toolbar; sheet de voto oscuro; PiP local |

## 3. Archivos modificados

- `src/Asambleas.Web/wwwroot/assembly.html`
- `src/Asambleas.Web/wwwroot/css/assembly-ocean.css` *(nuevo)*
- `src/Asambleas.Web/wwwroot/css/mobile-voting.css`
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js`
- `src/Asambleas.Web/wwwroot/js/modules/quorum.js`
- `src/Asambleas.Web/wwwroot/js/i18n/es-PA.js`
- `tools/e2e/ocean-assembly-cert.cjs`

## 4. Responsive

- **≥1100 px:** columna principal `minmax(0,1fr)` + rail ~320–400 px (Premium).
- **768–1099:** intermedia; tabs móviles ocultos.
- **≤767:** layout Móvil in-flow (overview → video → tabs → paneles); sin comprimir video con drawer lateral fijo.

## 5. Datos reales

Quórum, presencia, agenda, votación, participantes y media desde APIs/SignalR/LiveKit existentes. Sin nombres/%/mociones simulados de las plantillas.

## 6–7. Pruebas y resoluciones

Todas con `overflow = 0`. Móvil: tabs + quorum card visibles. Escritorio: sin tabs móviles. Módulo `room-app.js` carga OK.

Capturas: `tools/e2e/ocean-assembly-results/vp-*.png`, `tabs-*.png`, `president-1366.png`.

**Nota:** cuenta propietario demo no disponible en este entorno local; UX owner validada por chrome (`operator-only` / diagnostics ocultos). Presidente probado end-to-end.

## 8. Capturas

Ver carpeta `ocean-assembly-results/` (móvil 320–412, tableta 768, escritorio 1280–2048).

## 9. Base de datos

Sin migraciones ni cambios destructivos.

## 10. Estado final

**CERTIFICADO**
