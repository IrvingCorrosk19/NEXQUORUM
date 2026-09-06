# AUDITORIA_RENDIMIENTO_NAVEGACION_Y_POSTBACKS.md

**Fecha:** 2026-09-06  
**Alcance:** UI estática `wwwroot` + APIs `/api` + SignalR  
**Método:** revisión de código + flujo de navegación (sin reescritura SPA)

---

## 1. Arquitectura real

| Capa | Tecnología |
|------|------------|
| Host | ASP.NET Core (`UseDefaultFiles` + `UseStaticFiles`, controllers `/api`, hub SignalR) |
| UI | **Multi-page static HTML** + ES modules (`type="module"`). **No Blazor / no MVC Razor como shell** |
| Auth | Cookie + antiforgery; login vía `POST /api/auth/login` (AJAX) |
| Navegación entre features | Mayoría **`location.href` / `<a href>`** → recarga completa del documento |
| Soft navigation | Hash en `ph.html` / `owner.html`; tabs de sala (solo CSS); `history.replaceState` puntual |

**Conclusión:** el dolor no es “postback WebForms”. Es (1) muchas navegaciones de documento completo entre pantallas y (2) **sobre-fetch / sobre-render dentro** de sala y PH admin.

---

## 2. Flujo al cambiar de pantalla (ejemplo)

### A. Dashboard → PH → tab Unidades

1. Click en IA nav / CTA → `location.href = /ph.html`  
2. Recarga HTML+CSS+JS + `/api/auth/me` + memberships  
3. `openPh(id)` → `GET /api/ph/{id}` (+ a veces `GET /api/ph`)  
4. **Prefetch forzado** `Promise.all([units, owners, coefficients, readiness, assemblies])` aunque el usuario solo vea Resumen  
5. `switchTab` puede **volver a pedir** coefficients / readiness / assemblies  
6. `mountIaShell` → `mountGlobalPhSwitcher` **vuelve a registrar** click/input en el switcher

### B. Asamblea en vivo (SignalR)

1. Evento `voteTallyUpdated` / `speakerQueueUpdated` / `motionUpdated`  
2. Casi siempre `refreshPanels()` → re-render completo del sidebar  
3. `motionUpdated` / `refreshRoom` / `rehydrate` pueden pedir **`/motions` en paralelo**  
4. Burst de eventos → múltiples paints en el mismo tick

### C. Tabs internas de sala

- Click de tab: **solo toggle de clases** (sin API) — correcto.

---

## 3. Hallazgos (priorizados)

### H1 — Prefetch total al abrir un PH
- **Causa raíz:** `openPh` siempre ejecuta `Promise.all([loadUnits, loadOwners, loadCoefficients, loadReadiness, loadAssemblies])` (`ph-app.js` ~659).
- **Evidencia:** 5+ GETs aunque la vista inicial sea Resumen.
- **Impacto:** P0 (latencia percibida al entrar/cambiar PH).
- **Riesgo corrección:** Bajo (lazy-load por tab; mutaciones ya recargan).
- **Solución:** Cargar solo datos del tab activo; TTL corto para no re-fetch inmediato.

### H2 — `switchTab` + `openPh` duplican cargas
- **Causa:** Tras prefetch, tabs coefficients/readiness/assemblies vuelven a llamar `load*` (`ph-app.js` ~729–731).
- **Impacto:** P0.
- **Solución:** Cargar bajo demanda + skip si datos frescos (&lt; TTL).

### H3 — Listeners duplicados del PH switcher
- **Causa:** `mountGlobalPhSwitcher` hace `addEventListener` en cada `mountIaShell` (`ph-switcher.js` ~172–186); tabs PH remontan shell.
- **Impacto:** P0 (clicks múltiples / trabajo de más).
- **Riesgo:** Bajo.
- **Solución:** Bind one-shot (`data-bound` / flag).

### H4 — `refreshPanels` en ráfaga SignalR
- **Causa:** Cada evento llama `refreshPanels()` sin coalescer (`room-app.js` ~1771+, handlers ~2605+).
- **Impacto:** P0 (parpadeo / jank en vivo).
- **Solución:** Coalesce con `requestAnimationFrame` (un paint por frame).

### H5 — `/motions` y room-state repetidos
- **Causa:** `rehydrate`, `motionUpdated`, `liveWorkspace.refreshRoom` sin single-flight/TTL (`room-app.js` ~188–199, 2076–2087, 2614–2622).
- **Impacto:** P0.
- **Solución:** `cachedGet` / single-flight en `api.js` + invalidación al mutar.

### H6 — Doble paint al arrancar sala
- **Causa:** `rehydrate` → `applyRoomState` → `refreshPanels`; luego boot llama otra vez `refreshPanels` (~2768).
- **Impacto:** P1.
- **Solución:** Eliminar/coalescer el refresh final de boot.

### H7 — Búsqueda PH sin debounce
- **Causa:** `#unit-search` / `#owner-search` → `loadUnits`/`loadOwners` en cada `input` (`ph-app.js` ~274).
- **Impacto:** P1.
- **Solución:** Debounce 250ms + `dedupeKey`/abort.

### H8 — Navegación multi-página completa entre features
- **Causa:** Diseño MPA (`location.href` entre dashboard/agenda/checkin/etc.).
- **Impacto:** P1 percibido (esperado arquitectónicamente).
- **Solución (esta pasada):** No convertir a SPA. Optimizar in-page + caché GET seguro. Soft-nav SPA queda como mejora futura opcional.

### H9 — AbortController infrautilizado
- **Causa:** `api.js` soporta `dedupeKey`, pero casi no se usa en rehydrate/PH/dashboard.
- **Impacto:** P1.
- **Solución:** Usar `dedupeKey`/`cachedGet` en rutas calientes.

### H10 — Postbacks clásicos / botones sin type
- **Hallazgo:** No es el patrón dominante; formularios usan `preventDefault` + API; chrome suele llevar `type="button"`.
- **Impacto:** P2 residual.

---

## 4. Qué NO se tocará

- Reglas de votación / mayoría / coeficientes.
- Esquema DB / migraciones.
- Permisos, auditoría, aislamiento tenant/PH.
- Conversión masiva a SPA.
- Loaders artificiales para “ocultar” latencia.

---

## 5. Plan de implementación

| Prioridad | Cambio | Archivos |
|-----------|--------|----------|
| P0 | GET single-flight + TTL corto + invalidate | `api.js` |
| P0 | Coalesce `refreshPanels` | `room-app.js` |
| P0 | Motions vía caché; quit doble paint boot | `room-app.js` |
| P0 | Lazy tabs PH + TTL tab data | `ph-app.js` |
| P0 | Bind one-shot PH switcher | `ph-switcher.js` |
| P1 | Debounce búsquedas unidades/owners | `ph-app.js` |
| P1 | Medir antes/después | harness + cert |

---

## 6. Métricas objetivo (medibles)

- Al abrir PH en Resumen: **dejar de disparar** units+owners+coefficients+assemblies hasta visitar el tab.
- En sala con burst SignalR: **≤1** `refreshPanels` por frame.
- GETs concurrentes idénticos a `/motions`: **1** inflight (single-flight).

---

## 7. Estado de remediación (2026-09-06)

Implementado según plan P0/P1. Certificación medible en CERTIFICACION_OPTIMIZACION_NAVEGACION.md y 	ools/e2e/nav-perf-results/nav-perf.json (10/10 PASS).