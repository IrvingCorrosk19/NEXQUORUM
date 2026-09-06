# Certificación final — Navegación híbrida

## Veredicto

**PARTIALLY CERTIFIED**

La queja principal (MPA lento entre Dashboard/PH/Agenda/Check-in/Votaciones) queda resuelta en el cluster soft con shell persistente. No se declara `CERTIFIED` porque el plan de regresión obligatorio no se reejecutó completo en esta corrida (LiveKit multiparticipante remoto, HistoricalSeal, AccessLink/passwordless, importación masiva, cross-PH/tenant formal, MASTER subset completo).

## Identidad del código

- SHA base: `6041908b05b1e04fe89a5fe09ef4b885af5a6069`
- Worktree: `C:\Proyectos\NEXQUORUM`
- Rama: `master`
- Cambios no commiteados en módulos listados abajo (estado dirty al certificar).

## Archivos tocados

- src/Asambleas.Web/Program.cs
- src/Asambleas.Web/wwwroot/js/modules/hybrid-router.js (new)
- src/Asambleas.Web/wwwroot/js/modules/lifecycle.js (new)
- src/Asambleas.Web/wwwroot/js/modules/session-shell-cache.js (new)
- src/Asambleas.Web/wwwroot/js/modules/dashboard-app.js
- src/Asambleas.Web/wwwroot/js/modules/ph-app.js
- src/Asambleas.Web/wwwroot/js/modules/agenda-app.js
- src/Asambleas.Web/wwwroot/js/modules/checkin-app.js
- src/Asambleas.Web/wwwroot/js/modules/voting-studio-app.js
- src/Asambleas.Web/wwwroot/js/modules/owner-portal-app.js
- src/Asambleas.Web/wwwroot/js/modules/room-app.js
- src/Asambleas.Web/wwwroot/js/modules/auth.js
- src/Asambleas.Web/wwwroot/js/modules/api.js
- src/Asambleas.Web/wwwroot/js/modules/ph-context.js
- src/Asambleas.Web/wwwroot/js/modules/ph-switcher.js
- tools/e2e/forensic-hybrid-soft.mjs (new)
- tools/e2e/forensic-nav-matrix.mjs
- tools/e2e/mobile-voting-cert.mjs

## Arquitectura / lifecycle / rutas

Ver `IMPLEMENTACION_NAVEGACION_HIBRIDA.md`.

## Métricas

| Escenario | Resultado |
|-----------|-----------|
| Soft shell estable | Sí (mismo `shell-*` en cluster) |
| Soft me=0 | Sí |
| Soft avg | ~54 ms |
| Soft max observado (votaciones) | 238 ms (hybrid-soft) / 148 ms (matrix) |
| Hard sala | ~2.8 s (esperado) |
| Recordings | 1 GET |
| Build Release aislado | PASS (`artifacts/hybrid-nav-build-*`) |

## Pruebas ejecutadas en esta remediación

| Prueba | Resultado |
|--------|-----------|
| `forensic-hybrid-soft.mjs` | PASS criteria (shell, ≤1200, me=0) |
| `forensic-nav-matrix.mjs` (soft+hard) | softStable=true, softMeZero=true |
| `mobile-voting-cert.mjs` | **22/22 PASS** (fixture present antes de open) |
| Integration `VotingTransaction` | **3/3 PASS** |
| Build Release (output aislado) | PASS |
| Room dispose probe | `disposeForHybridLeave` limpia tracks media |
| LiveKit multiparticipante cert | **NO re-ejecutado** (script default remoto nip.io) |
| HistoricalSeal / AccessLink / import / PH switch / cross-tenant | **NO re-ejecutados en esta corrida** |
| MASTER subset crítico | **NO re-ejecutado completo** |

## Fallos preexistentes documentados (Fase 0)

- `mobile-voting-cert` fallaba 10/22 por fixture que no presentaba moción Ready (elegía Archived/Voting). Corregido en fixture; regla de negocio intacta.
- Build bloqueado por `Asambleas.Web` local en :5188 — resuelto con stop de instancia confirmada / output aislado.

## Evidencia SignalR / LiveKit

- Soft cluster: no abre sala → 0 conexiones nuevas por hop soft.
- Sala: 1 hub SignalR + 1 LiveKit observados al entrar; dispose deja `video/audio` sin `srcObject`.
- Continuidad móvil en cert: PASS (probe LiveKit local puede reportar `hasRoom:false` según entorno fake-media).

## Seguridad

- Soft-router no autoriza: cada mount vuelve a APIs autenticadas.
- Operador en `owner.html` no hard-reloadea el shell; soft-redirige a dashboard.
- Caché shell no guarda tokens/antiforgery.
- No se modificaron permisos backend, quorum, votación, tenant isolation, ni esquema DB.

## Riesgos residuales

1. Dup GET de `/api/assemblies/{id}` en algunos mounts (agenda/check-in/voting) — no es `/me`, pero se puede deduplicar.
2. CSP: error de inline script bloqueado en algunas páginas (preexistente).
3. Soft→sala sigue siendo hard (diseño); latencia de sala no es el foco del soft cluster.
4. Regresión LiveKit multiparticipante / cross-tenant no revalidada aquí.
5. `lifecycle.js` helpers no adoptados uniformemente en todos los módulos (contrato manual sí).

## Evidencia móvil

- Owner soft en 390×844: shell híbrido activo.
- `mobile-voting-cert` viewports 320–430: PASS.

## Presidente + propietario simultáneos

- Cubierto por `mobile-voting-cert` (22/22) con votación abierta.

## Veredicto final permitido

`PARTIALLY CERTIFIED` — remedación P0/P1 del cluster soft demostrada con métricas comparables; regresión histórica completa pendiente para subir a `CERTIFIED`.