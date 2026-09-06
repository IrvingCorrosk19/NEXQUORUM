# INCIDENTE P0 — SALA VPS VIDEO / PRESENCIA

## Veredicto

**P0 SOFTWARE RESOLVED — HUMAN MEDIA VERIFICATION PENDING**

La causa raíz de caché/versionado quedó contenida y verificada en VPS. Presencia mutua, video con fake media, SignalR/LiveKit (1 conexión por usuario), matriz de votación completa en asamblea E2E aislada, idempotencia, voto tardío, coeficiente y aislamiento pasaron. La prueba humana con cámara/micrófono físicos **no** se ejecutó: permanece `HUMAN VERIFICATION REQUIRED` (fake media no certifica hardware).

**Software: CIERRE COMPLETO** (caché, presencia, votación, regresiones, build, smoke).

No declarar `P0 RESOLVED AND VPS VERIFIED` hasta completar la checklist humana de A/V real.

## Hora del incidente / cierre funcional

- Reporte usuario: 2026-09-06 ~09:29 America/Panama (UTC-5) — **válido y compatible con la causa raíz** (HTML nuevo + módulos JS antiguos por caché `immutable`).
- Contención desplegada: 2026-09-06 14:40 UTC (commit `1682709`)
- Cierre funcional VPS (este documento): 2026-09-06 ~15:56 UTC — software completo; solo pendiente A/V humana

## Corrección de redacción (obligatoria)

| Antes (incorrecto) | Después |
|--------------------|---------|
| “Falso en verificación controlada” | **No reproducido después de la contención** |
| “Falso: WSS LiveKit abre” | **Funcionamiento confirmado después de la corrección** |

El reporte original del usuario no se invalida: es coherente con mezcla HTML/módulos por caché immutable de `?v=` débil.

## Clasificación asamblea `768822c2-…` (protección de datos)

| Campo | Valor |
|-------|--------|
| Id | `768822c2-e34c-446e-9b02-78e8c157dca8` |
| Título | Asamblea Ordinaria — Septiembre 2026 |
| Tenant | Ocean Tower Demo Tenant (`11111111-…1101`) |
| PH | **PH Studio UI 39571313** / `STU-39571313` |
| Creada | 2026-09-06 04:05 UTC |
| Uso en este cierre | **Solo read-only** (conexión/presencia/render). **Sin** presentar mociones, abrir/cerrar votos, emitir votos, alterar asistencia/quórum/propietarios/coeficientes ni borrar evidencias. |

Clasificación: **asamblea de Studio UI en tenant demo**, no PH OCEAN canónico. Aun así se trató como no mutable por posible uso de sesión real en Studio.

**Hallazgo de datos (no mutado):** en OCEAN-PH, owners seed `…6101` / `…6102` tienen correos personales en VPS. La E2E usó **`owner103@ocean.demo`** (ownership demo intacto). No se reescribieron owners 101/102.

## Asamblea E2E de certificación

| Campo | Valor |
|-------|--------|
| Título | `E2E-P0-VPS-VIDEO-VOTACION` |
| Id | `05643270-c60e-4f12-9dfc-13f71e6a5dfe` |
| PH | `33333333-…3301` PH DEMO OCEAN TOWER (`OCEAN-PH`) — reactivado solo para certificación |
| Actores | `president@ocean.demo` + `owner103@ocean.demo` |
| Evidencia | `tools/e2e/incidente-p0-cierre-20260906_095533/` |

Sin convocatorias reales ni correos reales.

## Fase 1 — Contención de caché (VPS)

Evidencia: `fase1-cache.json`

| Comprobación | Resultado |
|--------------|-----------|
| `assembly.html` → `Cache-Control: no-cache` | PASS |
| `room-app.js?v=p0sala20260906a` → `no-cache`, no `immutable` | PASS |
| `?v=mobile-vote5` ya **no** es `immutable` | PASS |
| HTML carga `room-app.js?v=p0sala20260906a` (no `mobile-vote5` como primario) | PASS |
| Módulos no sirven `text/html` | PASS |
| Sin imports 404 | PASS |
| Sin Service Worker controlando assets | PASS |
| Incógnito = misma versión `p0sala20260906a` | PASS |
| Recarga normal obtiene HTML actualizado (`no-cache`) | PASS |

Ctrl+F5 **no** es la solución permanente; solo excepción para pestañas que conservaron el asset immutable previo.

## Fase 2 — Quórum `10% / 190.50%` (read-only)

Evidencia: `quorum-19050-analysis.json`

| Concepto | Valor |
|----------|--------|
| UI | `formatPct(currentCoefficient)` / `formatPct(requiredCoefficient)` — sufijo `%` sobre **coeficientes**, no “% de progreso” |
| Presente | `10.00` = unidad FARID (`CoefficientSnapshot`) |
| Requerido | `190.50` = Σ coeficientes elegibles × (`RequiredQuorumPercent`/100) |
| Σ unidades PH Studio | **381.00** (100+100+100+50+10+21) |
| `RequiredQuorumPercent` | 50 → 381 × 0.50 = **190.50** |

**Clasificación:** dato de prueba inválido / PH Studio con coeficientes no normalizados a ~100. **No** es doble conteo de agregación ni defecto que haga a un PH íntegro mostrar >100 incorrectamente.

Contraste E2E OCEAN: UI mostró **`14.00% / 50.00%`** (unidad 103 coeff 14; quórum 50% de Σ=100).

## Fase 3 — Matriz de votación (asamblea E2E)

Evidencia: `matrix.json`, `tally-closed.json`, capturas `matrix-*.png`, `bags.json`

| # | Caso | Resultado |
|---|------|-----------|
| 1–2 | Presidente / propietario entran | PASS |
| 3 | Presencia mutua | PASS (`presence-rediag.json`: remotes=1 ambos; probe inicial falló por API de diagnóstico, reconfirmado) |
| 4–5 | SignalR / LiveKit 1 conn/usuario | PASS |
| 6–7 | Mismo `roomName`, identities distintas | PASS `assembly-05643270c60e4f129dfc13f71e6a5dfe` |
| 8–9 | Presentar moción / propietario la recibe | PASS |
| 10–11 | Abrir votación / overlay móvil auto | PASS |
| 12–13 | Minimizar “Consultar asamblea” / banner | PASS |
| 14–17 | Selección → confirmar → emitir → éxito post-servidor | PASS (`VT-DE7255`) |
| 18–19 | Doble voto bloqueado | PASS (HTTP 400) |
| 20–22 | Presidente actualiza; participación; coeficiente | PASS cerrado: `votesCast=1`, `inFavorCoefficient=14`, `participatingCoefficient=14` |
| 23–25 | Cerrar / voto tardío rechazado | PASS (HTTP 400) |
| 26–27 | Reload estado final | PASS |
| 28–29 | Aislamiento otra asamblea / cross-PH room distinto | PASS (+ tests CrossTenant 6/6) |

## Fase 4 — Video real (hardware)

| Caso | Resultado |
|------|----------|
| Fake media transporte/render | PASS (videos locales; LiveKit multiparticipante remotes=1) |
| Cámara/micrófono físicos humanos | **HUMAN VERIFICATION REQUIRED** — no ejecutado |

## Fase 5 — Permisos denegados

| Caso | Resultado |
|------|----------|
| Conectado pese a media denegada | PASS (sesión previa incidente + fase5) |
| No afirmar “primer participante” con remoto | PASS cuando remotes≥1 (`fase5-no-false-first-participant`) |
| Banner / tiles sin video | PASS (contención previa) |

## Fase 6 — Regresión mínima (COMPLETA)

| Suite | Resultado |
|-------|-----------|
| mobile-voting-cert (E2E + owner103, API login) | **PASS 22/22** |
| LiveKit multiparticipante VPS | **PASS** |
| VotingTransaction + MotionStudioIsolation | **PASS 6/6** Integration |
| SignalR reconnect (offline→online) | **PASS** |
| MeetingRoomNaming Unit | **PASS 3/3** |
| CrossTenant + MeetingToken Security | **PASS 6/6** |
| Build Release completo | **PASS** 0 warnings / 0 errors |
| Smoke VPS | asambleas_web **healthy**; HTML/JS no-cache |

Resumen: tools/e2e/incidente-p0-cierre-20260906_095533/fase6-final-summary.json

## Verificación humana de medios (ÚNICO PENDIENTE)

Estado: HUMAN VERIFICATION REQUIRED

URL E2E: https://asambleas.164.68.99.83.nip.io/assembly.html?assemblyId=05643270-c60e-4f12-9dfc-13f71e6a5dfe

Checklist (2 equipos reales):
1. Presidente (president@ocean.demo) con cámara/mic físicos y permisos OK
2. Propietario (owner103@ocean.demo) en otro equipo/teléfono con cámara/mic físicos
3. Video remoto visible en ambos lados
4. Audio remoto confirmado en ambos lados
5. Apagar/encender cámara
6. Silenciar/activar micrófono
7. Propietario sin cámara: tile visible; sigue recibiendo remoto
8. Salir detiene cámara y micrófono

Al completar esta checklist, el veredicto puede subir a: P0 RESOLVED AND VPS VERIFIED.

## Criterios de cierre vs veredicto

| Criterio | Estado |
|----------|--------|
| Caché/versionado permanente | Cumple |
| Entrada directa / Dashboard hard-nav | Cumple (previo + E2E) |
| Presencia mutua | Cumple |
| Video mutuo fake media | Cumple |
| Video/audio humano real | **Pendiente** |
| 1× SignalR + 1× LiveKit / usuario | Cumple |
| Matriz votación + idempotencia + tardío | Cumple |
| Participación / coeficiente | Cumple (14) |
| Cross-PH / cross-tenant | Cumple |
| Quórum 190.50% explicado, no defecto de fórmula | Cumple |
| Build Release | Cumple |
| Sin mutar datos reales de `768822c2` | Cumple |

**Veredicto exacto:** `P0 SOFTWARE RESOLVED — HUMAN MEDIA VERIFICATION PENDING`
