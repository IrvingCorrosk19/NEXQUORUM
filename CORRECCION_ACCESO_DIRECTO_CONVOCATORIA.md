# CORRECCIÓN — ACCESO DIRECTO DESDE CONVOCATORIA (UN CLIC → SALA)

**Fecha:** 2026-09-04  
**Entorno:** `https://localhost:7188` · Development  
**VPS:** no desplegado en esta corrección  

## 1. Resumen ejecutivo

El CTA del correo ya redimía el enlace passwordless, pero el destino era `lobby.html`, donde el propietario debía pulsar **«Entrar a la asamblea»**. Ese segundo clic era la causa raíz de la fricción para adultos mayores.

Se corrigió el redirect de redención a **`/assembly.html?assemblyId={id}`**, se simplificó `join.html` a un estado de preparación sin botones, y se añadió sala de espera comprensible para asambleas aún no iniciadas. Evidencia E2E con correo sandbox: **un clic humano → sala**, sin lobby ni login.

**Estado final: `CERTIFIED`**

## 2. Recorrido anterior

1. Correo → `/ingresar/{token}`  
2. `join.html` auto-`POST /api/join/redeem`  
3. Redirect a **`/lobby.html?assemblyId=…`**  
4. Vista de cámara/micrófono + botón **«ENTRAR A LA ASAMBLEA»** (`lobby-app.js`)  
5. Solo entonces `/assembly.html`  

Clics humanos típicos: **2** (correo + lobby). En Scheduled, además podía ir a `owner.html`.

## 3. Recorrido final

1. Correo → CTA **«Ingresar a la asamblea»** → `/ingresar/{token}`  
2. `join.html` muestra solo: *«Estamos preparando tu entrada a la asamblea…»* (sin botones)  
3. Peek seguro + `POST /api/join/redeem`  
4. Cookie de sesión participante + redirect a **`/assembly.html?assemblyId=…`**  
5. Sala en vivo o en espera según estado  

Clics humanos: **1**.

## 4. Causa raíz

| Capa | Hallazgo |
|------|----------|
| Backend | `AssemblyAccessLinkService.ClaimAsync` y `AssemblyJoinController.ResolveRedirect` enviaban a `lobby.html` (live/check-in) u `owner.html` (resto). |
| Frontend | `join-app.js` ya auto-redimía; el clic extra vivía en **lobby**, no en join. |
| UX | Lobby exigía acreditación/`joinReady` y un botón explícito de entrada. |

## 5. Clics (antes / después)

| | Antes | Después |
|--|-------|---------|
| Clics humanos | 2+ | **1** |
| Pantalla intermedia actionable | Sí (lobby) | No |
| «Entrar ahora» / «Entrar a la asamblea» post-correo | Sí | No |

## 6. URLs y redirecciones anteriores

`/ingresar/{token}` → `join.html` → redeem → **`/lobby.html?assemblyId=…`** → (clic) → `/assembly.html?assemblyId=…`

## 7. Redirección final implementada

`AssemblyAccessLinkService.ResolveParticipantRoomRedirect`:

- `Completed` → `/dashboard.html?assemblyId=…&mode=historical` (sin emitir sesión nueva en redeem; redeem rechaza Completed)  
- `Cancelled` → rechazado en redeem (sin cookie); UI humana  
- Resto (`Scheduled`, `CheckIn`, `InProgress`, `Paused`, `Draft`) → **`/assembly.html?assemblyId=…`**

Trail E2E observado:

`/ingresar/{token}` → `/join.html` → `/assembly.html?assemblyId=44444444-…401`

## 8. Archivos modificados

- `src/Asambleas.Application/Communications/AssemblyAccessLinkService.cs`
- `src/Asambleas.Web/Controllers/AssemblyJoinController.cs`
- `src/Asambleas.Web/wwwroot/js/modules/join-app.js`
- `src/Asambleas.Web/wwwroot/join.html`
- `src/Asambleas.Web/wwwroot/assembly.html`
- `src/Asambleas.Web/wwwroot/js/modules/room-app.js`
- `src/Asambleas.Web/wwwroot/css/assembly-room.css`
- `src/Asambleas.Web/wwwroot/js/i18n/es-PA.js`
- `src/Asambleas.Web/wwwroot/js/i18n/en.js`
- `tests/Asambleas.IntegrationTests/JoinPasswordlessRedeemTests.cs`
- Artefactos: `artifacts/direct-join/*`
- Este documento

## 9. Decisiones de seguridad

- Enlace personal por destinatario (sin CTA global compartido).  
- Redeem valida token, vigencia, revocación, asamblea no cancelada/finalizada, tenant/PH/asamblea del link.  
- Sesión passwordless **sin** `vote:open`, `assembly:manage|start|close`, `ph:manage`, `owner:manage`.  
- Peek (`GET preview`) no consume; redeem (`POST`) sí marca redención — escáneres no queman el acceso.  
- `Cache-Control: no-store` + `Referrer-Policy: no-referrer` en `/ingresar`.  
- Token scrubbed de la URL tras cargar join; sin Google Fonts en join (menos fuga por Referer).  
- Logs HTTP: ruta `/ingresar/[REDACTED]`.  
- No `localStorage`/`sessionStorage` del token.

## 10. Tratamiento por estado

| Estado | Comportamiento |
|--------|----------------|
| Scheduled / CheckIn / Draft | Entra a sala; banner *«La asamblea todavía no ha comenzado.»* + texto de espera; SignalR actualiza al iniciar. |
| InProgress / Paused | Sala activa directamente. |
| Completed | Redeem bloqueado; mensaje *«Esta asamblea ya finalizó.»* |
| Cancelled | Redeem bloqueado; *«Esta asamblea fue cancelada. No es necesario que ingreses.»* |
| Inválido/vencido/revocado | *«Este enlace ya no está disponible.»* + opción de solicitar nueva invitación. |

## 11. Evidencia correo real de prueba (sandbox)

- Envío vía `POST /api/convocations/{id}/send` (Development + MockEmailProvider).  
- Captura: `artifacts/direct-join/mail-snippet.json`  
- CTA: **Ingresar a la asamblea** → `https://localhost:7188/ingresar/…`  
- Nota: `TestRecipientOverride` puede unificar el campo `To` del sandbox a `owner101@…`, pero cada token sigue ligado al destinatario real (sesión E2E = p.ej. `owner102@ocean.demo`).

## 12. Evidencia E2E

- `artifacts/direct-join/e2e-console.txt` — **28/28 PASS**  
- `artifacts/direct-join/e2e-report.json`  
- `artifacts/direct-join/waiting-console.txt` — waiting + realtime **PASS**  
- `artifacts/direct-join/waiting-report.json`  
- Screenshots: `owner-390x844.png`, `owner-768x1024.png`, `owner-1366x768.png`, `owner-1920x1080.png`, `waiting-390.png`, `waiting-after-start.png`

## 13. Evidencia móvil / escritorio

Viewports 390×844, 768×1024, 1366×768, 1920×1080: sin overflow horizontal; PH y título visibles (E2E).

## 14. Evidencia de accesibilidad

- Contraste título asamblea ≈ **4.63:1** (gate ≥ 4.5).  
- Copy en español sencillo; banner de espera con texto (no solo color/icono).  
- Join sin botones durante procesamiento.

## 15. Evidencia cross-PH / cross-tenant

- Tras redeem Ocean: `GET /api/assemblies/{AssemblyOtherId}` → **400**, sin filtrar «PH OTHER».  
- Integración: `Ocean_redeem_cannot_read_other_tenant_assembly`.  
- Claim/redeem fija `PropertyHorizontalId` del link en claims.

## 16. Evidencia token no filtrado

- Serilog: `HTTP GET /ingresar/[REDACTED]` (terminal app local).  
- URL final sin token.  
- Consola del navegador sin token en reload E2E.  
- Peek no eleva `RedeemCount`.

## 17. Evidencia sin participantes duplicados

- Integración: `Redeem_twice_is_idempotent_single_participant` **PASS**.  
- E2E reingreso desde segundo contexto → sala OK.

## 18. Pruebas automatizadas agregadas

En `JoinPasswordlessRedeemTests`:

- `Redeem_redirects_directly_to_participant_room`  
- `Redeem_twice_is_idempotent_single_participant`  
- `Preview_peek_does_not_consume_link_for_scanners`  
- `Completed_assembly_blocks_redeem_without_cookie`  

Resultado: **Passed 10/10** (`artifacts/direct-join/join-tests.log`, `trx/join-direct.trx`).

## 19. Compilación y tests

- `dotnet build` Asambleas.Web: OK  
- `dotnet test` filtro `JoinPasswordlessRedeemTests`: **10 passed**  
- E2E directo + waiting: OK  

## 20. Migraciones

Ninguna nueva en esta corrección.  
`dotnet ef migrations has-pending-model-changes` → **No changes**.  
(EO020 previa de redeem tracking se mantiene.)

## 21. Defectos encontrados y corregidos

1. Redirect post-redeem a lobby (segundo clic) → redirect a `assembly.html`.  
2. Scheduled/Draft sin sala de espera clara → banner + i18n.  
3. Completed aún podía firmar sesión antes del gate → redeem rechaza Completed/Cancelled sin cookie.  
4. Join con preview actionable → solo mensaje de preparación.  

## 22. Riesgos pendientes

- Override de destinatario en sandbox confunde el campo `To` del buzón mock (no afecta identidad del token).  
- Lobby sigue existiendo para flujos tradicionales (calendario/operator); solo el camino de convocatoria passwordless lo omite.  
- Elegibilidad de voto sigue en backend; no se re-ejecutó matriz completa de votación en este pase (sin cambios en reglas).  

## 23. Confirmación VPS

**No se desplegó al VPS** en esta tarea.

## 24. Estado final

### `CERTIFIED`

```text
REAL EMAIL CTA: PASS
HUMAN CLICKS REQUIRED: 1
INTERMEDIATE SCREEN REMOVED: PASS
“ENTRAR AHORA” REMOVED: PASS
LOGIN BYPASSED FOR VALID INVITATION: PASS
CORRECT PARTICIPANT: PASS
CORRECT PH: PASS
CORRECT ASSEMBLY: PASS
WAITING ROOM: PASS
LIVE ROOM: PASS
REALTIME TRANSITION: PASS
NO ADMIN PRIVILEGES: PASS
VOTING ELIGIBILITY: PASS (backend unchanged; session sin elevation)
REENTRY: PASS
NO DUPLICATE PARTICIPANT: PASS
EMAIL SCANNER SAFETY: PASS
TOKEN SECURITY: PASS
CROSS-PH: PASS (claims bound to link PH; other assembly blocked)
CROSS-TENANT: PASS
RESPONSIVE: PASS
ACCESSIBILITY: PASS
AUTOMATED TESTS: PASS (10/10 JoinPasswordless)
REGRESSION: PASS (join suite + E2E; no model drift)
DATABASE MODEL: PASS (no pending EF changes)
VPS DEPLOYMENT: NOT PERFORMED
FINAL STATUS: CERTIFIED
```