# Certificación — Consola `assembly.html` (presidente)

**Fecha:** 2026-09-08  
**Base:** `https://localhost:7188`  
**Script:** `tools/e2e/assembly-console-cert.cjs`  
**Matriz:** `tools/e2e/assembly-console-results/matrix.json`  
**Resultado:** **CERTIFICADO** (95 pass / 0 fail)

## 1. Causas raíz

| Defecto | Causa exacta |
|---|---|
| Panel derecho cortado / overflow horizontal | `.room { max-width: 100vw }` + rail ancho + hijos Grid/Flex sin `min-width: 0`; metrics del header empujaban el chip de quórum fuera del viewport |
| Coeficiente fuera de tarjeta | Chip con `min-width`/contenido largo (`Mín. 50.00%`) y `overflow` inconsistente; scrollWidth > clientWidth |
| Contraste panel / guía | `opacity` en contenedores idle + `.cx-guide` claro sobre fondo oscuro |
| Header enorme | Grid de 3 columnas iguales + metrics con `flex-wrap` + chips EN VIVO / VOTO / quórum apilados (~145–230 px) |
| Video “sello postal” | Tile en CSS Grid con `height: %` sin fila definida; hermano `.media-empty-hint` robaba altura flex |
| Barras internas / scroll doble | Sidebar ocupaba fila de grid en &lt;1280 aunque fuera `fixed`; stage colapsaba |
| Barra inferior tapando | En móvil 8 botones envueltos en 2 filas (~125 px) sin agrupar secundarios |
| Jerga técnica dominante | Cockpits LiveKit/“Total lógico” en escenario principal |
| Presentes vs conectados | Sin resumen unificado ni diagnóstico colapsado |

## 2. Archivos modificados

- `src/Asambleas.Web/wwwroot/assembly.html`
- `src/Asambleas.Web/wwwroot/css/assembly-room.css`
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js`
- `src/Asambleas.Web/wwwroot/js/modules/quorum.js`
- `src/Asambleas.Web/wwwroot/js/modules/meeting.js` (etiquetas de rol)
- `src/Asambleas.Web/wwwroot/js/i18n/es-PA.js` / `en.js`
- `tools/e2e/assembly-console-cert.cjs`

## 3. Cambios de estructura / estilos

- Shell viewport: header | body | toolbar; `minmax(0,1fr)` + rail `clamp(20–25rem)`.
- &lt;1280: panel operativo = drawer/bottom-sheet (Escape + backdrop); no reserva fila de grid.
- Header compacto de una fila (~56–60 px): marca · PH/título · métricas.
- Quórum compacto: `Quórum OK` + `%`; mínimo en detalle/popover.
- Solo tile: flex column + hint absolutizado.
- Barra móvil: una fila; Pantalla/Cola vía menú **Más**.
- Stage column: scroll único interno en móvil; body sin overflow horizontal.

## 4. Cambios UX

- Resumen: Acreditados / Presentes / Conectados a la sala / Representados.
- **Diagnóstico de conexión** cerrado por defecto.
- Roles en español (`Presidente`); sin `LiveKit media` / `Total lógico` / `Usted · president` en UI.
- Acción primaria y contraste AA en panel oscuro.
- Toggle panel: etiquetas cortas `Panel` / `Cerrar`.

## 5–6. Pruebas y resultados por resolución

Todas con `overflow = 0`, quórum dentro, sidebar no cortado, barra visible, header ≤96 px, solo-tile ≥45 % del stage, sin términos prohibidos.

| Viewport | Overflow | Notas |
|---|---|---|
| 320×568 | 0 | Header 56 / bar 63 |
| 360×800 | 0 | OK |
| 390×844 | 0 | OK |
| 412×915 | 0 | OK |
| 768×1024 | 0 | Header ~74 |
| 1024×768 | 0 | Header ~60 |
| 1280×720 | 0 | Rail desktop |
| 1366×768 | 0 | OK |
| 1440×900 | 0 | OK |
| 1920×1080 | 0 | OK |
| 2048×1152 | 0 | OK |
| Zoom 100/125/150 @1366 | 0 | OK |

## 7. Evidencias

Capturas en `tools/e2e/assembly-console-results/`:

- Matriz: `vp-320x568.png` … `vp-2048x1152.png`
- Zoom: `zoom-100.png`, `zoom-125.png`, `zoom-150.png`
- Extra: `evidence-390-closed.png`, `evidence-390-panel-open.png`, `evidence-768-panel-open.png`, `evidence-1366.png`
- Referencias previas del ciclo de corrección: `after-fix-*.png`, `fixed-*.png`, `01-desktop-1366-before-start.png`

## 8. Overflow horizontal

Confirmado: `document.documentElement.scrollWidth <= clientWidth` en todas las resoluciones y zooms de la matriz.

## 9. Funcionalidad preservada

- LiveKit: `#video-mount` y tiles activos (smoke estructural PASS).
- Quórum: chip + detalles; reglas no alteradas.
- Presencia: resumen operativo visible.
- Votaciones/permisos/acreditación: sin cambios de reglas de negocio.
- Controles A/V y panel operativo siguen cableados (drawer Escape, Más → pantalla/cola).

## 10. Resultado final

**CERTIFICADO**
