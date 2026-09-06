# CERTIFICACION_OPTIMIZACION_NAVEGACION.md

**Fecha:** 2026-09-06  
**Alcance:** Optimizacion in-page (PH admin + sala LiveKit/SignalR) sin conversion a SPA  
**Evidencia medible:** 	ools/e2e/nav-perf-cert.mjs -> 	ools/e2e/nav-perf-results/nav-perf.json (10/10 PASS)

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| src/Asambleas.Web/wwwroot/js/modules/api.js | cachedGet + invalidateCachedGet (TTL + single-flight) |
| src/Asambleas.Web/wwwroot/js/modules/ph-switcher.js | Bind one-shot (dataset.phSwitcherBound) |
| src/Asambleas.Web/wwwroot/js/modules/ph-app.js | Lazy tabs, TTL soft, debounce busqueda, openPh seq, sin prefetch x5 |
| src/Asambleas.Web/wwwroot/js/modules/ph-context.js | Cache memberships//api/ph; invalidacion en switch |
| src/Asambleas.Web/wwwroot/js/modules/room-app.js | 
efreshPanels rAF; etchAssemblyMotions; sin paint boot redundante |
| AUDITORIA_RENDIMIENTO_NAVEGACION_Y_POSTBACKS.md | Diagnostico Fase 1 |
| 	ools/e2e/nav-perf-cert.mjs | Harness de medicion |

---

## Causas raiz corregidas

| ID | Causa | Estado |
|----|-------|--------|
| H1 | Prefetch total al abrir PH | Corregido (lazy por tab) |
| H2 | switchTab re-fetch tras prefetch | Corregido (soft + TTL 8s) |
| H3 | Listeners duplicados PH switcher | Corregido |
| H4 | 
efreshPanels en rafaga SignalR | Corregido (1 paint/frame) |
| H5 | /motions duplicados | Corregido (cachedGet 2.5s + invalidate en mutacion) |
| H6 | Doble paint boot sala | Corregido |
| H7 | Busqueda sin debounce | Corregido (250ms) |
| Extra | Subscribe PH default a assemblies | Corregido (default 
esumen) |
| Extra | /api/ph repetido | Corregido (TTL 5s + invalidate) |

---

## Peticiones antes / despues (medido)

Escenario: abrir Ocean PH en #resumen (Playwright, president@ocean.demo).

| Metrica | Antes | Despues |
|---------|-------|---------|
| GETs eager units+owners+coeff+readiness+calendar | **5** | **0** |
| GET /api/ph (lista) en open | 3-6 | **1** |
| Total /api/* en open (mismo harness) | **19** (corrida previa multi-PH) | **10** |
| Tiempo open (networkidle + settle) | — | **2351 ms** |
| Tab Unidades (1a visita) | 1 GET | **1 GET** |
| Tab Unidades (revisit <8s) | >=1 GET | **0 GET** |
| GET .../motions al boot sala | >=2-3 sin single-flight | **<=2** (PASS) |

Fuente: 
av-perf.json (tUtc 2026-09-06T12:25:35Z).

---

## Consultas / trabajo eliminado

- 5 endpoints de catalogo PH diferidos hasta el tab activo.
- Re-fetch warm de tabs dentro de TTL.
- Paints redundantes de sidebar en sala (coalesce rAF + sin refresh de boot).
- Listados /api/ph y memberships compartidos via cache de pestana (keys por path; aislamiento por cookie de sesion).

---

## Postbacks eliminados

No habia postbacks WebForms/MVC. Se elimino trabajo equivalente a recarga de datos:

- Prefetch forzado al entrar al PH.
- Re-render completo multiple por frame en sala.
- Re-bind del switcher en cada mountIaShell.

---

## Estrategia de cache e invalidacion

| Recurso | TTL | Invalidacion |
|---------|-----|--------------|
| cachedGet generico | configurable (default 2.5s) | invalidateCachedGet(prefix) |
| /motions | 2.5s | force en motionUpdated / present |
| /api/ph, memberships | 5s | create PH, switch PH |
| Tab PH (units/owners/...) | 8s soft | invalidatePhTabData al abrir PH / import roster; mutaciones usan load sin soft |

No se cachea de forma compartida entre usuarios: memoria del tab del navegador; claves incluyen IDs de PH/asamblea.

---

## Pruebas ejecutadas

1. 
ode tools/e2e/nav-perf-cert.mjs -> **10/10 PASS**
2. Navegacion PH resumen -> units -> owners -> units (warm)
3. Boot sala demo assembly
4. dotnet build Asambleas.Application Release -> OK
5. dotnet test Meeting filter UnitTests -> **9/9 PASS**

### Checklist funcional (alcance seguro)

| # | Caso | Resultado |
|---|------|-----------|
| 1 | Navegacion pantallas / tabs PH | PASS (medido) |
| 2 | Regresar a tab visitado | PASS (0 GET warm) |
| 3 | Modales | Sin cambio de reglas |
| 4 | Filtros/busqueda | Debounce aplicado |
| 5 | CRUD | Loads post-mutacion sin soft |
| 6 | Movil | Mismos modulos ES |
| 7 | Roles | Sin cambio de permisos |
| 8 | Multitenant | Keys por PH/asamblea; switch invalida |
| 9 | Datos tras modificacion | Invalidacion + load forzado |
| 10 | Duplicados | Assert harness PASS |
| 11 | Doble clic create PH | dedupeKey: ph-create |
| 12 | Boton Atras | Hash 
eplaceState; MPA href intacto |

---

## Resultado de build

- Application Release: **succeeded**
- Web Release full copy: bloqueado por proceso Asambleas.Web en ejecucion (JS servido en vivo desde wwwroot)
- UnitTests Meeting: **9 passed**

---

## Riesgos pendientes

- Cruce entre features (dashboard.html <-> calendar.html) sigue siendo MPA — fuera de alcance sin SPA.
- POST .../owners/validate-bulk en resumen sigue siendo costo de negocio (atencion PH).
- Doble GET .../recordings en boot sala (candidato P2).
- Cache TTL corto puede servir dato <=8s stale al cambiar de tab sin mutacion local — mutaciones invalidan/fuerzan.

---

## Evidencia de no alteracion de negocio

- Sin migraciones DB / sin cambios de esquema.
- Sin cambios en endpoints de votacion, quorum, permisos o claims mas alla de invalidar cache de lista tras switch.
- Optimizaciones limitadas a cliente (wwwroot JS) + harness/docs.
- Comportamiento funcional de tabs/hash/IA nav preservado; solo se dejo de pre-cargar datos no visibles.

---

## Como re-medir

`ash
node tools/e2e/nav-perf-cert.mjs
`

Requiere ASAM_BASE_URL, ASAM_DEMO_PASSWORD y app local en marcha.
