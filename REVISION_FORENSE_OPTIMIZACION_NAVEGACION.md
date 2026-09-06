# REVISION_FORENSE_OPTIMIZACION_NAVEGACION.md

**Fecha revision:** 2026-09-06  
**Metodo:** contraste codigo + documentos + matriz Playwright real (`tools/e2e/forensic-nav-matrix.mjs`) + reintento de suite historica  
**Regla aplicada:** PASS historico != PASS actual  
**Codigo de producto:** NO modificado en esta revision  

**Evidencia primaria de red:** `tools/e2e/forensic-nav-results/matrix.json`  
**Base medida:** `http://127.0.0.1:5188` · PH Ocean `33333333-...3301` · Asamblea `44444444-...4401`

---

## 0. Veredicto ejecutivo

| Pregunta | Clasificacion | Resumen |
|----------|---------------|---------|
| La optimizacion resolvio la queja de navegacion entre pantallas? | **NO COMPROBADO como resuelto** / **PARCIALMENTE CONFIRMADO** solo en tabs internas PH/sala | La queja principal (Dashboard/PH/Agenda/Votos/Sala/Owner) sigue siendo **MPA con recarga completa** |
| La certificacion de navegacion es valida como CERTIFIED? | **NO** — no cumple criterios del usuario | Comparaciones no iscenario, build Web bloqueado, regresion historica no re-pasada, movil real de votacion fallido en este entorno |
| Existe regresion causal por los cambios de cache/nav? | **NO COMPROBADO** (sin nexo causal) | Fallos de mobile-voting-cert parecen estado de mocion/demo, no prueba de rotura por rAF/cachedGet |
| Build Web completo Release | **BLOQUEADO** | PID `Asambleas.Web (3252)` bloquea copia de DLLs |
| Suite historica critica re-ejecutada | **BLOQUEADO / PARCIAL** | Mobile voting 10/22; IntegrationTests no construyen por lock; Unit MeetingRoomNaming 3/3 PASS |

**Veredicto final: NO CERTIFIED** para la optimizacion de navegacion como remedio de la experiencia reportada.

---

## 1. Queja del usuario vs lo que se optimizo

### Queja original (sintesis)
Navegacion lenta entre pantallas/pestanas/modales; postbacks/recargas; parpadeo; re-fetch; perdida de estado.

### Arquitectura real (CONFIRMADO CON EVIDENCIA ACTUAL)
- UI: HTML estatico multipagina + ES modules (`wwwroot`).
- Navegacion entre features: `<a href>` / `location.href` / `location.assign` (p.ej. `dashboard-app.js`, `ia-nav.js` `assemblyHref`, `ph-context.js` switch).
- Soft-nav limitada: hash en `ph.html` / `owner.html`; tabs CSS en sala.

### Hallazgo forense central
**CONFIRMADO CON EVIDENCIA ACTUAL:** la mala experiencia al moverse entre Dashboard, PH, Agenda, Check-in, Voting Studio, Sala y Owner **es precisamente la recarga de documento MPA**, no un postback WebForms.

La pasada de optimizacion (H1–H7) ataco **sobre-fetch/sobre-render dentro** de `ph-app.js` y `room-app.js`, y dejo **H8 (MPA entre features) fuera de alcance**. Eso reduce consultas internas, pero **no elimina** el costo dominante de cada hop entre `.html`.

---

## 2. Critica a CERTIFICACION_OPTIMIZACION_NAVEGACION.md

| Debilidad senalada | Clasificacion | Evidencia |
|--------------------|---------------|-----------|
| 2351 ms sin baseline anterior comparable | **CONFIRMADO** como debilidad metodologica | Cert admite tiempo before vacio; wall-clock incluye settle artificial |
| 19 vs 10 APIs bajo escenarios distintos | **CONFIRMADO** | Corrida "19" uso PH `adb006df-...`; corrida "10" uso Ocean `33333333-...` |
| `/motions` permite <=2 (posible duplicacion) | **CONFIRMADO CON EVIDENCIA ACTUAL** | Forensic room hop: 1x `/motions` + **2x `/recordings`**; cert anterior aceptaba <=2 motions |
| Build Web bloqueado | **CONFIRMADO / BLOQUEADO** | MSB3027 lock `Asambleas.Web (3252)` en `dotnet build Asambleas.sln -c Release` |
| Solo 9 unit tests Meeting | **CONFIRMADO** | No es suite historica; `VotingTransaction` vive en **IntegrationTests**, no UnitTests |
| Movil "mismos modulos ES" | **CONFIRMADO** como no-evidencia | No habia medicion movil de hops en la cert de nav |
| Nav entre features fuera de alcance | **CONFIRMADO** | Texto explicito en cert + auditoria H8 |
| Stale hasta 8s | **CONFIRMADO** en codigo | `PH_TAB_TTL_MS = 8000` en `ph-app.js` |
| Doble GET recordings pendiente | **CONFIRMADO CON EVIDENCIA ACTUAL** | Matriz: dos `GET .../recordings` en boot sala |
| Markdown con caracteres de control / rutas rotas | **CONFIRMADO** | En `CERTIFICACION_...` y auditoria: secuencias tipo `ools/`, `efreshPanels`, `etchAssemblyMotions`, bloques bash corruptos |

**Conclusion sobre la cert previa:** midio mejora **real pero estrecha** (tabs PH lazy). **No demuestra** que la queja de navegacion entre pantallas este resuelta.

---

## 3. Matriz de navegacion real (Playwright)

Fuente: `tools/e2e/forensic-nav-results/matrix.json` (17 hops).  
Nota: `ms` incluye `waitForTimeout` de asentamiento (2.2–5.0s). `timing.duration` del HTML es tipicamente << wall-clock; el costo percibido esta en **JS modules + APIs post-DCL**.

| Origen | Destino | Recarga completa | GET totales | GET duplicados (extra) | API | JS | CSS | Tiempo wall (ms) | Estado perdido |
|--------|---------|------------------|-------------|------------------------|-----|----|-----|------------------|----------------|
| login | Dashboard | SI | 35 | 0 | 4 | 19 | 8 | 2361 | SI (heap/shell) |
| Dashboard | PH | SI | 35 | 0 | 7 | 15 | 10 | 2557 | SI |
| PH | Asamblea (dashboard) | SI | 35 | 0 | 4 | 19 | 8 | 2559 | SI |
| Asamblea | Votaciones | SI | 40 | 1 | 8 | 18 | 10 | 3073 | SI |
| Votaciones | Sala | SI | 84 | 36 | 10 | 46 | 18 | 4872 | SI + SignalR/LiveKit rebuild |
| Sala | Agenda | SI | 37 | 2 | 7 | 17 | 7 | 2614 | SI (deja sala) |
| Agenda | Dashboard | SI | 37 | 0 | 4 | 19 | 8 | 2548 | SI |
| Dashboard | Check-in | SI | 40 | 2 | 8 | 18 | 8 | 2552 | SI |
| history | Browser Back | SI* | 37 | 0 | 4 | 19 | 8 | 2044 | SI* (bfcache no garantizado) |
| prior | Revisit PH | SI | 37 | 0 | 7 | 15 | 10 | 2535 | SI (no reutiliza heap) |
| PH hash | #units (soft) | **NO** | 1 | 0 | 1 | 0 | 0 | 1507 | NO (estado JS vivo) |
| PH hash | #owners (soft) | **NO** | 1 | 0 | 1 | 0 | 0 | 1514 | NO |
| login | Owner portal 390x844 | SI | 32 | 0 | 6 | 14 | 8 | 2539 | SI |
| Owner | Sala mobile | SI | 82 | 36 | 9 | 46 | 18 | 4871 | SI + LiveKit |
| dual | President Sala | SI | 84 | 36 | 10 | 46 | 18 | 5431 | SI |
| dual | Owner Sala | SI | 82 | 36 | 9 | 46 | 18 | 5400 | SI |
| login | Tablet PH | SI | 38 | 0 | 9 | 15 | 10 | 2540 | SI |

**Promedio hops full-reload (wall):** **3233 ms**.

### Que se recarga en cada hop MPA (CONFIRMADO)

| Recurso | Se recarga? | Notas |
|---------|-------------|-------|
| HTML | SI | Navigation Timing `type=navigate` |
| CSS | SI (request) | En sala muchos CSS se piden 2x |
| JS (ES modules + LiveKit UMD) | SI | 14–46 requests JS por hop |
| Fuentes Google | SI | Duplicados observados en sala |
| `/api/auth/me` | SI (1; a veces 2) | En todos los hops full-reload medidos |
| Membresias | SI en shells IA | 0 en algunos boots de sala |
| Contexto PH / switcher | Reconstruido | `mountIaShell` + switcher en boot |
| Catalogos PH | Depende | Lazy ayuda solo si ya estas en `ph.html` |
| Datos asamblea | SI | room-state / studio / checkin |
| SignalR | Destruido al salir de sala | Debe re-unir al volver |
| LiveKit | Destruido al salir de sala | Debe re-token/reconnect |

### Destruccion/reconstruccion

| Elemento | Entre features `.html` | Entre tabs hash PH |
|----------|------------------------|--------------------|
| Shell global / IA nav | Reconstruido | Persistente |
| Listeners pagina | Nuevos | Soft path conserva |
| cachedGet in-memory | **Wipe** (nuevo documento) | Conserva |
| SignalR / LiveKit | Tear-down si se deja sala | N/A en PH |
| Filtros/pestanas | Perdidos salvo URL/hash | Hash conserva tab |

---

## 4. Que corrigio realmente la optimizacion anterior

| ID | Efecto real | Clasificacion |
|----|-------------|---------------|
| H1/H2 lazy PH tabs | Al abrir Resumen ya no pide units/owners/coeff/readiness/calendar | **CONFIRMADO** |
| H3 switcher one-shot | Evita stack de listeners | **PARCIALMENTE CONFIRMADO** (codigo) |
| H4 rAF refreshPanels | Reduce paints por burst SignalR | **PARCIALMENTE CONFIRMADO** (codigo; sin FPS trace) |
| H5 cachedGet motions | Soft-dedupe corto | **PARCIALMENTE CONFIRMADO** |
| H6 sin refresh boot extra | Menos paint inicial | **PARCIALMENTE CONFIRMADO** |
| H7 debounce busqueda | Menos spam input | **PARCIALMENTE CONFIRMADO** |
| Cache `/api/ph` + memberships TTL 5s | Solo dentro del mismo documento | **CONFIRMADO** — inutil entre hops MPA |

---

## 5. Que parte de la queja continua sin resolverse

1. Navegacion entre features sigue full reload (~2.5–5.4s wall; 35–84 GET).  
2. `/api/auth/me` (+ memberships) en casi cada pantalla.  
3. Parpadeo/reconstruccion de shell al cruzar `.html`.  
4. Perdida de estado in-memory (incl. `cachedGet`) al cambiar de feature.  
5. Salida de sala destruye SignalR/LiveKit; volver es costo alto.  
6. Doble `/recordings`.  
7. TTL 8s puede servir tabs stale.

---

## 6. Contraste con certificaciones historicas (re-verificacion)

| Area historica | Cert previa | Re-verificacion hoy | Clasificacion |
|----------------|-------------|---------------------|---------------|
| Mobile voting full-screen / minimize / confirm / idempotency | MOBILE CERTIFIED 22/22 | `mobile-voting-cert.mjs` **10/22** — fallo abrir voto (`Voting can only be opened for a presented motion`) | **NO COMPROBADO** (bloqueado por estado demo); sin nexo causal a nav-opt |
| Viewports mobile sheet CSS | PASS | 7 viewports PASS | **PARCIALMENTE CONFIRMADO** |
| LiveKit multiparticipant | CERTIFIED | No re-ejecutado | **NO COMPROBADO** |
| SignalR dual-browser studio | UI_UX/MASTER | Dual boot sala sin matriz de voto abierta | **NO COMPROBADO** |
| Vote idempotency backend | Integration `VotingTransaction` | **BLOQUEADO** por lock Web al build IntegrationTests | **BLOQUEADO** |
| LiveKit room naming | Unit | MeetingRoomNaming **3/3 PASS** | **CONFIRMADO CON EVIDENCIA ACTUAL** |
| Passwordless / import / historical seal / studio gaps | MASTER | No re-ejecutados | **NO COMPROBADO** |
| Responsive tablet | UI_UX | Tablet PH hop medido | **PARCIALMENTE CONFIRMADO** (nav only) |
| Seguridad/permisos | MASTER | Sin ataque cross-tenant re-corrido | **NO COMPROBADO** |

---

## 7. Alternativas arquitectonicas (sin implementar)

### A. Mantener MPA + optimizar cache HTTP / estaticos / estado URL
- Beneficio: menor costo de bytes/TTFB; Cache-Control/ETag; preload CSS compartidos.
- Riesgo: bajo.
- Archivos: `Program.cs` static headers, HTML preload, versionado assets.
- Seguridad: bajo si no se cachean APIs autenticadas compartidas.
- LiveKit/SignalR: sin cambio de ciclo de vida.
- Regresion: baja. Esfuerzo: S (1–3 dias).
- Recomendacion: **piso obligatorio**, insuficiente solo.

### B. Shell persistente + navegacion parcial
- Beneficio: conserva nav/contexto/me; solo cambia main.
- Riesgo: medio-alto (routing, leaks, permisos por vista).
- Archivos: shell nuevo, `ia-nav`, loaders por feature.
- Seguridad: medio — revalidar auth/claims por vista.
- LiveKit/SignalR: critico — no desmontar sala al cambiar paneles no-sala.
- Regresion: alta. Esfuerzo: L (2–4 semanas).
- Recomendacion: medio plazo.

### C. Hibrido solo rutas criticas (**recomendado**)
Soft-nav/panel swap para: `dashboard ↔ agenda ↔ checkin ↔ voting-studio` + entrada controlada a `assembly`; mantener hash PH.
- Beneficio: ataca la queja real sin SPA total.
- Riesgo: medio; frontera sala LiveKit explicita (entrar/salir = mount/unmount).
- Archivos: `ia-nav.js`, `ia-page.js`, apps dashboard/agenda/checkin/voting-studio, gate `assembly`.
- Seguridad: re-check permisos al soft-route; antiforgery intacto.
- LiveKit/SignalR: aislar ciclo a `room-app`.
- Regresion: media (mitigable con E2E). Esfuerzo: M (1–2 semanas P0).
- Recomendacion: **P0/P1 preferida**.

### D. SPA completa
- Beneficio: maximo control. Riesgo: muy alto. Esfuerzo: XL.
- Recomendacion: **no** ahora.

---

## 8. Plan de remediacion propuesto (solo plan; sin codigo)

### P0
1. Aceptar: nav entre features **no** esta resuelta.  
2. Soft-routing hibrido (C) para cluster asamblea.  
3. Eliminar doble GET recordings.  
4. Cache HTTP agresiva CSS/JS; investigar requests x2 en sala.  
5. Desbloquear build (parar proceso o output aislado).  
6. Re-ejecutar mobile-voting tras mocion Presented (fix ambiente).

### P1
1. Persistencia corta de `me`/memberships en sessionStorage con invalidacion logout/switch.  
2. Extender estado filtros PH en URL.  
3. Trace Performance jank sala (rAF).  
4. Re-correr LiveKit multiparticipant + VotingTransaction + EO021 subset.

### P2
1. Evaluar app-shell (B) si C no basta.  
2. Prefetch controlado de estaticos.  
3. Reescribir docs corruptos UTF-8.

### Archivos tentativos (si se autoriza)
`ia-nav.js`, `ia-page.js`, `dashboard-app.js`, `agenda-app.js`, `checkin-app.js`, `voting-studio-app.js`, `room-app.js`, headers estaticos.  
Sin schema DB; sin reglas de voto.

### Pruebas a repetir despues
- `forensic-nav-matrix.mjs` (mismo escenario)  
- `mobile-voting-cert.mjs`  
- `livekit-multiparticipant-cert.mjs`  
- Integration `VotingTransaction`  
- Subset MASTER (HistoricalSeal, AccessLink, imports, voting-studio-gaps)  
- `dotnet build Asambleas.sln -c Release` sin lock  
- Dual president+owner con votacion abierta  

---

## 9. Clasificacion consolidada

| Afirmacion | Estado |
|------------|--------|
| MPA full reload es causa dominante entre features | **CONFIRMADO CON EVIDENCIA ACTUAL** |
| Optimizacion mejoro tabs internas PH | **CONFIRMADO CON EVIDENCIA ACTUAL** |
| Optimizacion resolvio queja de navegacion general | **NO COMPROBADO** (evidencia en contra) |
| Cert nav es CERTIFIED valida | **NO** / criterios incumplidos |
| 19 vs 10 comparable | **NO COMPROBADO** (escenarios distintos) |
| Sin peticiones duplicadas | **NO COMPROBADO** (recordings x2; assets x2) |
| Build Web OK | **BLOQUEADO** |
| Mobile voting sigue PASS | **NO COMPROBADO** (10/22 FAIL) |
| Regresion causada por nav-opt | **NO COMPROBADO** |
| Suite historica revalidada | **BLOQUEADO / PARCIAL** |

---

## 10. Cierre obligatorio

1. **Que corrigio realmente:** lazy-load PH, debounce, switcher bind, coalesce refresh sala, soft-cache motions/listas **dentro del documento**.  
2. **Que sigue sin resolverse:** recargas MPA entre pantallas principales, rebuild de shell/me/JS, tear-down LiveKit/SignalR al cruzar fuera de sala, recordings duplicados.  
3. **Regresiones encontradas:** ninguna **causal** demostrada; fallos actuales en mobile-voting-cert y build/integration **BLOQUEAN** re-certificacion.  
4. **Metricas comparables:** tabla seccion 3. Baseline pre-opt **ausente** para hops MPA; 19/10 **no comparable limpia**. Soft PH: ~1 API vs ~35 GET full hop.  
5. **Alternativa recomendada:** **C (hibrido rutas criticas)** + piso **A (cache HTTP/estaticos)**.  
6. **Plan P0/P1/P2:** seccion 8.  
7. **Archivos tentativos:** seccion 8.  
8. **Pruebas post-fix:** seccion 8.  
9. **Veredicto:** **NO CERTIFIED**. La optimizacion fue util pero **insuficiente e insuficientemente medida** respecto a la queja real de navegacion entre pantallas.

---

*Fin de la revision forense. Sin implementacion hasta autorizacion explicita.*