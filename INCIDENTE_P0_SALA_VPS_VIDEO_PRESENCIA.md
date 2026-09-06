# INCIDENTE P0 — SALA VPS VIDEO / PRESENCIA

## Hora del incidente

- Reporte usuario: 2026-09-06 ~09:29 America/Panama (UTC-5)
- Evidencia VPS capturada: 2026-09-06 14:30–14:42 UTC
- Contención desplegada: 2026-09-06 14:40 UTC (commit `16827093a4e3753d8593cc0addb9cd01f0d564e0`)

## Versión desplegada (antes / después)

| Momento | Commit | Contenedor |
|---------|--------|------------|
| Despliegue navegación híbrida | `f5c1b56` | asambleas_web recreado ~13:59 UTC |
| Contención P0 caché módulos | `16827093a4e3753d8593cc0addb9cd01f0d564e0` (`1682709`) | asambleas_web recreado ~14:40 UTC |

Worktree de publicación: `git archive HEAD` vía `Publish-AsambleasVps` (no worktree sucio).

Último release funcional anterior identificable: `6041908` (pre-híbrido). No se ejecutó rollback de aplicación porque la sala respondía en hard-nav tras autenticación API; el defecto reproducible era de **caché/versionado de assets** + UX de media denegada.

## Topología VPS confirmada

- Docker Compose proyecto `asambleas`
- Contenedores: `asambleas_web`, `asambleas_livekit`, `asambleas_egress`, `asambleas_postgres`, `asambleas_redis`
- systemd: unidad `asambleas` activa; Nginx reverse proxy
- Health: `/health/ready` = Healthy
- Evidencia cruda (sanitizada): `tools/e2e/incidente-p0-sala-20260906_093020/vps/`

## Síntomas reproducidos / no reproducidos

URL: `https://asambleas.164.68.99.83.nip.io/assembly.html?assemblyId=768822c2-e34c-446e-9b02-78e8c157dca8`

| Síntoma reportado | Hallazgo en VPS (Playwright) |
|-------------------|------------------------------|
| HTML/CSS cargan, video vacío | Con media denegada: tiles iniciales + banner “No se pudo activar cámara/micrófono”; con fake-device: **video local+remoto** |
| Presidente no ve propietario | **Falso en verificación controlada**: `remotes=1` mutuo |
| Propietario no entra a LiveKit | **Falso**: WSS LiveKit abre; mismo `roomName` |
| Placeholders `...` | Estado Check-In (“todavía no ha comenzado”) + agenda/moción vacías de datos, no fallo de boot |
| Peor tras híbrido | Relacionado con **caché immutable** de `room-app.js?v=mobile-vote5` sin bump |

## Evidencias navegador (sanitizadas)

Archivos:

- `browser-report-api.json`
- `lk-diagnostics.json` (post-fix también)
- `nomedia-remotes.json`
- `token-room-compare.json`
- capturas `03-pres-api.png`, `04-owner-api.png`

Resultados clave post-contención:

- Presidente y propietario: `connectionState=connected`, `remotes=1`, `cameras=2`, `mics=2`
- `roomName` idéntico: `assembly-768822c2e34c446e9b0278e8c157dca8`
- Tokens: mismo room grant; identities distintas (sin secretos en este doc)
- SignalR: 1 hub WSS por usuario; LiveKit: 1 WSS RTC por usuario
- 0 pageerrors JS; 0 API 4xx/5xx en boot autenticado
- Entrada desde Dashboard híbrido: hard navigation a `assembly.html` (shell híbrido no persiste en sala)

## Evidencias VPS

- `assembly.html` / `room-app.js` / `hybrid-router.js` checksums en `vps/asset-checksums.txt`
- Headers **antes**: `room-app.js?v=mobile-vote5` → `Cache-Control: public,max-age=31536000,immutable`
- Headers **después**: `/js/modules/*.js` → `Cache-Control: no-cache` (también con `?v=p0sala20260906a`)
- HTML sigue `no-cache`
- Logs 30m capturados (tokens redactados) en `vps/web-logs-30m.txt`, `vps/livekit-logs-30m.txt`, `vps/nginx-*.txt`

## Causa raíz exacta

1. **Primaria (despliegue/caché):** `Program.cs` marcaba como `immutable` cualquier estático con query `?v=`, incluidos labels débiles (`mobile-vote5`). Se modificó `room-app.js` (híbrido) **sin cambiar** el fingerprint en `assembly.html`. Los navegadores podían conservar un grafo ES congelado / mezclado tras el deploy, produciendo sala “media rota” o boot inconsistente sin Ctrl+F5.
2. **Secundaria (percepción):** sin permiso de cámara/micrófono la UI muestra banner de fallo y tiles sin `<video>`; si el remoto aún no aparece, el copy “Eres el primer participante” refuerza la sensación de sala inoperativa aunque SignalR/LiveKit estén vivos.
3. **No es causa:** soft-router montando la sala. `assembly.html` / `lobby.html` ya eran hard-nav; verificado que el shell híbrido no permanece dentro de la sala.

## Relación con navegación híbrida

- **Indirecta:** el deploy híbrido cambió `room-app.js` y activó la política de caché agresiva sin bump de `?v=`.
- **Directa (DOM/lifecycle soft-mount de sala):** **no confirmada**. Hard navigation directa funciona; entrada desde Dashboard también fuerza hard load.

## Archivos modificados (contención)

- `src/Asambleas.Web/Program.cs` — `no-cache` para `/js/modules` salvo fingerprint fuerte
- `src/Asambleas.Web/wwwroot/assembly.html` — `room-app.js?v=p0sala20260906a`
- `src/Asambleas.Web/wwwroot/js/modules/hybrid-router.js` — hard-nav explícita hacia sala/lobby; no soft desde páginas no-soft

Sin cambios de negocio, DB, migraciones ni secretos LiveKit.

## Corrección aplicada

1. Eliminar `immutable` sobre módulos ES con version labels débiles.
2. Bust de query de `room-app` en HTML.
3. Redesplegar VPS (`DEPLOY_OK`).
4. Reverificar presidente+propietario con fake media: video mutuo y presencia mutua.

## Pruebas presidente / propietario (VPS)

| Caso | Resultado |
|------|-----------|
| Hard URL directa, ambos autenticados | PASS conectividad |
| Fake media: video mutuo | PASS |
| Sin permisos media: tiles mutuos camera-off | PASS |
| Dashboard híbrido → sala | PASS hard nav + boot |
| Presentar moción / abrir votación / votar | **NO reejecutado en este incidente** |
| Móvil físico | NO |
| Aislamiento otra asamblea | NO |

## Estado SignalR / LiveKit / cámara / roster

- SignalR: conectado, frames recibidos
- LiveKit: connected, mismo room, remotes=1
- Cámara/mic: OK con fake-device; denegado muestra banner + tiles sin video
- Roster media: tiles local+remoto presentes tras contención

## Riesgos pendientes

1. Clientes que aún tengan `room-app.js?v=mobile-vote5` en disk cache **immutable** necesitan **una** recarga dura o esperar a que el HTML nuevo (no-cache) apunte a `p0sala20260906a`.
2. Matriz completa de votación P0 no re-corrida en asamblea `768822c2-…`.
3. Quórum `10% / 190.50%` en UI sugiere dato de asamblea de prueba anómalo (no tratado aquí).

## Veredicto

**P0 OPEN — NO CERTIFIED**

Motivo: la inoperatividad de sala (SignalR/LiveKit/presencia/video) quedó **contenida y verificada en VPS**, pero el criterio de cierre exige también **votación real presidente/propietario** en el VPS, que no se reejecutó completa en esta ventana.

Para pasar a `P0 RESOLVED AND VPS VERIFIED` falta cerrar la matriz de votación (presentar → abrir → votar → ver resultado → cerrar) en la URL afectada tras hard-refresh.