# INCIDENTE P0 — PRESIDENTE AGREGA PREGUNTA Y PARTICIPANTE NO PUEDE VOTAR

## Veredicto

**P0 OPEN — NO CERTIFIED**

**No declarar** `P0 RESOLVED — VOTING VERIFIED ON VPS`.

Motivos de no-certificación (esta sesión):

1. **No hay `assemblyId` real** aportado por URL del operador ni capturado de logs de sesión — no se identificó la asamblea afectada en producción/VPS.
2. **Dual-browser E2E en VPS no ejecutado** (presidente + participante en contextos separados sobre asamblea aislada desplegada).
3. **UAT humano móvil (390x844) no ejecutado**.

Las correcciones de software están en el working tree local (sin commit / sin deploy VPS certificado en este informe). Las pruebas de ciclo de apertura son locales. Eso **no** cierra el P0.

---

## Hora / alcance

| Campo | Valor |
|-------|--------|
| Reporte | 2026-09-06 ~13:35 America/Panama (UTC-5) |
| Síntoma | Presidente agrega pregunta; participante conectado no puede votar |
| Alcance de este informe | Forense de causa raíz + remediación local + evidencias de test local |
| Mutación de datos reales | **Ninguna** — no se presentó/abrió/cerró/votó sobre asamblea de cliente |
| Asamblea real afectada | **UNKNOWN** — operador debe suministrar URL / assemblyId |

---

## Causa raíz (software, con evidencia)

### Trampa de producto principal

Crear una pregunta **no** abre la votación. El flujo contractual es:

`Draft` → `Presentada` → `Sesión de votación Open` → voto → `Closed`

Si el presidente solo crea (o presenta sin abrir), el participante **correctamente** no tiene overlay / sheet de voto.

### 1. UX engañosa: "Guardar" ≈ votación lista

En `live-voting-workspace.js` (estado previo a la remediación), el flujo de Guardar podía **auto-presentar** y mostrar toast tipo **"Votación lista"** sin haber abierto sesión. El presidente creía que la votación estaba en vivo; el participante no tenía sesión Open ni mobile sheet. Coherente con el síntoma reportado.

**Remediación:** botones explícitos — Guardar borrador / Guardar y presentar / Guardar, presentar y abrir (con confirmación); etiquetas de estado; Presentar / Abrir / Cerrar en filas del cuestionario; toasts ya **no** afirman "Votación lista" sin open.

### 2. Bug de rehidratación: `refreshRoom` leía campos incorrectos

API `room-state` expone `activeMotion` / `openVotingSession`. Código de sala que leía solo `room.motion` / `room.session` del payload crudo podía **perder** la sesión abierta tras create/present/open si el evento SignalR no llegaba (o se perdía). El sistema no debe depender exclusivamente del evento en vivo.

**Remediación:** `refreshRoom` / rehydrate vía `hydrateRoomState` → `normalizeRoomState` (mapea `activeMotion`/`openVotingSession`), force motions, y `mobile-voting-sheet` `onOpened` / `sync` cuando hay sesión Open.

Evidencia de contrato API (test local): `VotingOpenLifecycleTests` — tras present, `OpenVotingSession` null; tras open, `OpenVotingSession` no null; cast exitoso.

### 3. Apertura bloqueada por padrón inválido

`VotingService.OpenSessionAsync` rechaza con `COEFFICIENT_CONFIGURATION_INVALID` cuando la suma de coeficientes del PH no es 100% (ej. padrón 381%). Mensaje en español mejorado en la ruta de open:

> No se puede abrir la votación porque la suma de coeficientes del PH es {X}%. Debe corregirse a 100.00%.

El bloqueo se **mantiene** (no se debilita la validación). UI mapea el código (`mapOpenVotingError` / cast / mobile sheet).

### 4. Códigos de dominio claros

| Situación | Código |
|-----------|--------|
| Abrir sobre Draft / no Presented | `MOTION_NOT_PRESENTED` |
| Cast con sesión Draft / no abierta | `VOTING_NOT_OPEN` |
| Cast con sesión ya cerrada | `VOTING_CLOSED` |
| Padrón inválido al abrir | `COEFFICIENT_CONFIGURATION_INVALID` |

---

## Fase 1 — Asamblea REAL (checklist 1–15)

**AssemblyId / motionId / tenant / PH / actores:** **UNKNOWN — el operador debe suministrar la URL.**  
En esta sesión no hubo identificación forense de asamblea real ni mutación de datos reales.

| # | Pregunta | Caso real | Comportamiento diseñado / E2E aislado (documentado) |
|---|----------|-----------|------------------------------------------------------|
| 1 | La pregunta fue creada? | UNKNOWN | Si — create motion → Draft |
| 2 | Quedo en Draft? | UNKNOWN | Si, hasta Present |
| 3 | Fue presentada? | UNKNOWN | Requerido antes de open; present ≠ open |
| 4 | Se abrió sesión de votación? | UNKNOWN | Solo tras `voting/open` exitoso |
| 5 | Backend confirmó apertura? | UNKNOWN | Open → sesión Status=Open |
| 6 | Se emitió evento SignalR? | UNKNOWN | Diseño: `votingOpened` + rehydrate por room-state |
| 7 | Participante recibió el evento? | UNKNOWN | No certificado VPS; local depende de SignalR + rehydrate |
| 8 | Frontend abrió overlay/formulario? | UNKNOWN | Solo con sesión Open + elegibilidad; sheet rehydrate on Open |
| 9 | Participante acreditado? | UNKNOWN | Cast exige acreditación / presencia según reglas |
| 10 | Estaba presente? | UNKNOWN | Reglas de attendance aplican |
| 11 | Unidad o representación activa? | UNKNOWN | Cast con unitId / poderes |
| 12 | Coeficiente válido? | UNKNOWN | Open bloqueado si suma ≠ 100% |
| 13 | Ya había votado? | UNKNOWN | Doble voto rechazado (suite previa) |
| 14 | Votación cerrada/expirada? | UNKNOWN | Cast cerrado → `VOTING_CLOSED` |
| 15 | Bloqueo por config coeficientes? | UNKNOWN | Posible contribuyente (padrón 381%); open path mensaje claro |

**Estado exacto pregunta/votación/elegibilidad (caso real):** no determinado — sin assemblyId.

---

## Correcciones aplicadas (local, working tree sin commit)

### Backend

- `VotingService.OpenSessionAsync`: mensaje claro ES si suma de coeficientes inválida; `MOTION_NOT_PRESENTED` si Draft / no Presented
- `VotingCodes.MotionNotPresented`
- Cast: `VOTING_NOT_OPEN` para sesión Draft vs `VOTING_CLOSED` cuando cerrada

### Frontend

- `live-voting-workspace.js`: Guardar borrador / Guardar y presentar / Guardar presentar y abrir (confirm); labels de estado; botones Presentar/Abrir/Cerrar en filas; toasts sin "Votación lista" sin open
- `room-app.js`: refresh/rehydrate vía `hydrateRoomState` + force motions + mobile `onOpened`/`sync`
- `voting.js`: `mapOpenVotingError`
- `mapCastError` + `mobile-voting-sheet.js`: códigos más claros
- `assembly.html`: cache bust `room-app.js?v=p0vote20260906b`

### Archivos modificados (lista)

| Archivo | Rol |
|---------|-----|
| `src/Asambleas.Application/Voting/VotingService.cs` | Open/cast mensajes y códigos |
| `src/Asambleas.Domain/Voting/VotingCodes.cs` | `MotionNotPresented` (+ uso de `VotingNotOpen`) |
| `src/Asambleas.Web/wwwroot/js/modules/live-voting-workspace.js` | UX ciclo Draft→Present→Open |
| `src/Asambleas.Web/wwwroot/js/modules/room-app.js` | Rehydrate / refreshRoom / errores |
| `src/Asambleas.Web/wwwroot/js/modules/voting.js` | `mapOpenVotingError` |
| `src/Asambleas.Web/wwwroot/js/modules/mobile-voting-sheet.js` | Mensajes de cast/open |
| `src/Asambleas.Web/wwwroot/assembly.html` | `?v=p0vote20260906b` |
| `tests/Asambleas.IntegrationTests/VotingOpenLifecycleTests.cs` | Ciclo open local |

(Otros archivos del working tree no listados aquí no forman parte de la evidencia de este P0.)

---

## Evidencia de build / tests (local)

| Prueba | Resultado |
|--------|-----------|
| `VotingOpenLifecycleTests` | **2/2 PASS** — open Draft → `MOTION_NOT_PRESENTED`; present ≠ open; open luego cast |
| `VotingTransactionTests` (+ lifecycle, corrida conjunta previa) | **5/5 PASS** (incluye lifecycle) |
| `dotnet build` Release | **OK** |
| Dual-browser VPS | **NO EJECUTADO** |
| Matriz Fase 7 completa + reconnect SignalR capturas | **NO EJECUTADO** |
| Human mobile 390×844 | **NO EJECUTADO** |
| Deploy VPS assets versionados para este fix | **NO CERTIFICADO en este informe** |

---

## Relación con coeficientes inválidos

Si el PH tiene suma ≠ 100% (ej. 381%):

- Create / present pueden ser posibles segun reglas existentes.
- **Open** falla con `COEFFICIENT_CONFIGURATION_INVALID` y mensaje accionable.
- Participante **no** debe ver votación abierta falsa.
- No se reescribe el padrón automáticamente ni se maquilla el porcentaje.

Sin `assemblyId` real no se puede afirmar que el caso del operador fue (a) solo Draft, (b) Present sin Open, (c) Open fallido por coeficientes, o (d) Open OK + bug de rehidratación UI.

---

## Pendiente para declarar RESOLVED

1. Identificar asamblea real desde URL del presidente (solo lectura).
2. Deploy VPS con assets versionados (`p0vote20260906b` o sucesor) — sin repetir incidente de caché immutable.
3. Dual-browser E2E en VPS sobre **asamblea aislada** (no datos cliente).
4. Matriz completa Fase 7 + capturas SignalR reconnect / rehydrate.
5. UAT humano móvil 390x844.

Criterio de cierre (solo entonces):

`P0 RESOLVED — VOTING VERIFIED ON VPS`

requiere: present correcto, open real, participante acreditado recibe UI, cast OK, presidente ve resultado, doble voto y voto tardío bloqueados, reload/reconnect recuperan, cross-PH/cross-tenant, dos contextos en VPS.

---

## Riesgos

| Riesgo | Severidad | Nota |
|--------|-----------|------|
| Deploy sin bump `?v=` / cache immutable | Alto | Participantes con JS viejo siguen con trampa UX / rehydrate roto |
| Presidente confunde Present con Open en build no desplegado | Alto | Sintoma original |
| Padron 381% sin diagnostico visible al presidente | Medio | Open bloqueado; mensaje ya mejorado localmente |
| Depender solo de SignalR sin rehydrate | Alto | Mitigado localmente vía `hydrateRoomState`; falta prueba VPS reconnect |
| Mutar asamblea de cliente "para probar" | Crítico | **Prohibido** — usar E2E aislada |

---

## Veredicto final

**P0 OPEN — NO CERTIFIED**

Software remediated locally with lifecycle tests green and Release build OK. Real assembly identity unknown; VPS dual-browser and human mobile UAT outstanding. Do not claim voting verified on VPS.