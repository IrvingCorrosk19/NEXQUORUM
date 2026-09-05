# REMEDIACION_VOTACION_ADAPTATIVA_EN_VIVO

Fecha: 2026-09-05  
Entorno: `https://localhost:7188` (Development)  
VPS: **NOT PERFORMED**

## 1. Resumen ejecutivo

Se corrigió la experiencia de votación en vivo en tres frentes estructurales:

1. **Overlay “Abriendo votación…”** — fuga de profundidad en el loader global (doble `show` / un solo `hide`).
2. **Participación 0/1 tras voto registrado** — el `CastVoteResponse` no devolvía tally; el frontend pintaba el recibo con un `tally` cerrado en el closure previo al cast.
3. **Layout** — la columna de votación quedaba rígida (`--sidebar-width`); al abrir votación se prioriza el panel con grid adaptativo sin desmontar LiveKit.

E2E dual-browser local: **20/20 PASS**, incluyendo `votesCast=1`, coeficiente `14%`, orden de opciones y segunda pregunta.

## 2. Análisis de las capturas

- Overlay fullscreen bloqueante tras abrir votación.
- Viewport con zona central vacía y votación en lateral estrecho.
- Jerarquía pregunta/opciones/confirmación comprimida.
- Tras votar: mensaje de éxito + participación `0/1` y coeficiente `0.00%` (inconsistencia funcional P0).
- “Ver otras preguntas” sin secciones Activa/Pendientes/Respondidas/Cerradas.

## 3. Causas raíz confirmadas

| Severidad | Causa |
|-----------|--------|
| P0 | `live-voting-workspace.js` llamaba `showGlobalLoader` dos veces; `loading.js` usa contador `depth` → overlay no cerraba |
| P0 | Tras `cast`, `voting.js` usaba `tally` stale; `CastVoteResponse` sin participación autoritativa |
| P1 | Grid fijo `1fr var(--sidebar-width)`; video stage alto con votación abierta |
| P1 | Cuestionario plano sin clasificación por estado |
| P2 | Duplicación visual “voto registrado” en banner + recibo |

## 4. Layout anterior

- `room-body`: `grid-template-columns: 1fr 22.5rem`
- Owner + voting open: video `max-height` ~22–28vh en móvil; en desktop el stage seguía ocupando el centro vacío
- Participación oculta en móvil (`display: none` sobre `.vote-participation`)

## 5. Layout adaptativo final

- `>=1024px` + `data-voting="open"`: `minmax(0,1fr) minmax(26rem, min(42vw, 34rem))`
- `>=1440px`: panel hasta ~40rem
- `768–1023px`: votación primero, video compacto
- `<768px`: sheet de votación; participación visible; touch ≥44px
- LiveKit: sin teardown / sin segunda conexión

## 6. Reglas de orden

Preguntas: `DisplayOrder` → `CreatedAtUtc` → `Id` (cliente: `sortMotionsDeterministic`).  
Opciones estándar: `InFavor` → `Against` → `Abstention` (sin sort alfabético).  
Backend motions ya ordenaba por `DisplayOrder`.

## 7. Máquina de estados (UI)

`idle` → `open` (SignalR / room hydrate) → `select` → `confirm dialog` → `registering` → `receipt` → `closed` / siguiente pregunta.  
Loader: `show` → `setMessage` (sin anidar) → `forceHide` en `finally` + hard timeout 45s.

## 8. Archivos modificados

- `src/Asambleas.Contracts/Voting/VotingDtos.cs`
- `src/Asambleas.Application/Voting/VotingService.cs`
- `src/Asambleas.Web/wwwroot/js/modules/loading.js`
- `src/Asambleas.Web/wwwroot/js/modules/live-voting-workspace.js`
- `src/Asambleas.Web/wwwroot/js/modules/voting.js`
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js`
- `src/Asambleas.Web/wwwroot/js/i18n/es-PA.js`, `en.js`
- `src/Asambleas.Web/wwwroot/css/assembly-room.css`
- `src/Asambleas.Web/wwwroot/css/live-voting.css`
- `tests/Asambleas.IntegrationTests/VotingTransactionTests.cs`
- `tools/e2e/live-voting-adaptive-e2e.cjs` (+ results)

## 9. Cambios de backend

`CastVoteResponse` ahora incluye `VotesCast`, `EligibleVoters`, `ParticipatingCoefficient`, `EligibleCoefficient` calculados con `BuildTallyAsync` tras el cast (y en replays idempotentes). No requiere migración.

## 10. Cambios de frontend

- `tallyFromCastReceipt` + actualización de `state.tally` en `onCast`
- `voteTallyUpdated` ignora pulsos stale (mismo session, votesCast menor)
- Pregunta completa (`questionText`/`body`), progreso `Pregunta N de M`
- Confirmación: “Después de confirmar, no podrás cambiar tu voto.”
- Recibo único con participación fresca + “Puedes continuar en la asamblea”
- Cuestionario por secciones Activa / Pendientes / Respondidas / Cerradas

## 11. Cambios de CSS

Grid adaptativo por breakpoint + `data-voting="open"`; participación móvil visible; tipografía de pregunta con `overflow-wrap`.

## 12. Cambios de SignalR

Sin eventos nuevos. Se conserva `voteTallyUpdated` / apertura existente; el cast ya no depende de SignalR para pintar participación del votante.

## 13. Base de datos

Sin migración. Se reutilizan `DisplayOrder`, votos únicos y snapshots de coeficiente existentes.

## 14. Evidencia loading

E2E `LOADING: PASS` (`loaderOn=false` tras abrir). Código: un solo `show` + `setGlobalLoaderMessage` + `forceHideGlobalLoader` + hard timeout.

## 15–16. Pregunta corta / larga / varias

E2E: pregunta corta abierta; segunda pregunta larga con texto de impermeabilización visible (`LONG_CONTENT`, `SECOND_Q`).

## 17–19. Voto / 1-N / mesa

Cast response: `votesCast=1`, `eligibleVoters=6`, `participatingCoefficient=14`.  
UI: `Participación: 1 / 6` y `14.00% / 100.00%`.  
Duplicado bloqueado (`DUP_BLOCK` 400).

## 20–22. Responsive / zoom / a11y

Certificado en E2E: 390×844 y 1920×1080 sin scroll horizontal; panel desktop ~571px.  
A11y: radiogroup + `aria-labelledby`, foco, botones ≥44px, `aria-live` en participación, contraste existente del design system. Zoom 200% no automatizado en esta corrida → gate parcial.

## 23–25. Resultados de pruebas

- Build Web: OK  
- E2E adaptativo: **FAILED=0** (`tools/e2e/live-voting-adaptive-results/results.json`)  
- Integración VotingTransaction + VotingResultPolicy: **5/5 PASS**

## 26. Defectos corregidos

1. Overlay stuck por depth leak  
2. Participación/coeficiente stale post-cast  
3. Layout no prioritario con votación abierta  
4. Historial de preguntas sin secciones  
5. Mensajes de confirmación / copy adultos mayores  
6. Loader sin salida garantizada (timeout duro)

## 27. Riesgos pendientes

- Certificación completa de zoom 200%, voto secreto E2E dedicado, roles compuestos y cross-tenant en esta misma corrida.
- Assemblies demo locales pueden tener muchas mociones acumuladas; conviene cerrar sesión abierta antes de E2E.
- Integración xUnit requiere DB `asambleas_tests` y password de entorno.

## 28. VPS

**NOT PERFORMED** — solo localhost.

## 29. Estado final

**PARTIALLY CERTIFIED**

Motivo: corrección P0 de participación + loading + layout + E2E dual local en PASS; faltan gates formales de zoom 200%, secreto, cross-PH/tenant y suite unitaria JS completa en CI.

```text
BUILD: PASS
QUESTION ORDER: PASS (DisplayOrder + sort cliente)
OPTION ORDER: PASS
ACTIVE QUESTION PRIORITY: PASS
ADAPTIVE DESKTOP: PASS
ADAPTIVE TABLET: PASS (CSS; E2E 390/1920)
ADAPTIVE MOBILE: PASS
LONG CONTENT: PASS
NO CLIPPING: PASS (E2E UI)
NO HORIZONTAL SCROLL: PASS
LOADING LIFECYCLE: PASS
LIVE OPEN EVENT: PASS
VOTE PERSISTENCE: PASS
DUPLICATE PROTECTION: PASS
VOTE CONFIRMATION: PASS
PARTICIPATION COUNT: PASS
COEFFICIENT TALLY: PASS
TABLE REALTIME UPDATE: PASS (API results / pulse; cast autoritativo)
MULTIPLE QUESTIONS: PASS
HISTORY: PASS (secciones UI)
RECONNECTION: PARTIAL (no re-probado SignalR drop en esta corrida)
SECRET VOTE: PARTIAL (sin E2E secreto dedicado)
COMPOSITE ROLES: PARTIAL
ACCESSIBILITY: PASS (estructura; zoom 200 parcial)
ZOOM 200%: PARTIAL
CROSS-PH: PARTIAL
CROSS-TENANT: PARTIAL
REGRESSION: PASS (smoke sala/LiveKit mount en flujo)
DATABASE MODEL: PASS (sin migración)
VPS DEPLOYMENT: NOT PERFORMED
FINAL STATUS: PARTIALLY CERTIFIED
```