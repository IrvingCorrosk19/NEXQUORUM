# Plan maestro — Certificacion E2E Browser 100%

**Stamp:** E2E-CERT-MASTER-20260906_142448  
**Initial SHA:** 8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef  
**Worktree:** C:/Proyectos/NEXQUORUM  
**Evidence dir:** tools/e2e/master-cert-results/20260906_142448/  
**Playwright:** tools/e2e/node_modules/playwright  
**Target default:** https://asambleas.164.68.99.83.nip.io (VPS health **200** at Phase 0)  
**Local:** https://localhost:7188 — **not running** at Phase 0 start  

**Estado actual:** IN PROGRESS — Phase 0–13 parcial. PASS=34 FAIL=0 PENDING=77 → **PARTIALLY CERTIFIED**.

---

## 1. Mision

Auditar, probar, corregir y certificar el sistema completo de ASAMBLEAS (ingreso → historico) con evidencia de navegador real (Playwright), multiples contextos autenticados y multi-pestana.

Cobertura obligatoria: PH, unidades, propietarios, ownerships, asambleas, agenda/calendario, convocatorias, enlaces, acreditacion, asistencia, quorum, sala, SignalR, LiveKit, mociones, votaciones, resultados, grabaciones, evidencias, acta, historicos, seguridad, multitenencia, responsive, accesibilidad, rendimiento, mensajes dinamicos, navegacion hibrida.

## 2. Limites de autoridad

**Puede corregir sin pedir permiso:** backend, frontend, JS, CSS, APIs, validaciones, navegacion, mensajes, pruebas, fixtures, rendimiento, races, consultas, SignalR, integracion LiveKit, bugs funcionales.

**Debe detenerse y pedir autorizacion:** cambio de esquema DB / migraciones de produccion; reglas de negocio no documentadas; borrar datos reales; regenerar secretos; comunicaciones reales; acciones irreversibles sobre asamblea real; infra fuera del sistema; reducir controles de seguridad.

**Proteccion repo:** no git reset --hard; no destruir trabajo ajeno; registrar SHA inicial/final y worktree; checkpoints seguros; **nunca** imprimir tokens/cookies/passwords/secretos en informes.

## 3. Principio browser-first

- Flujos criticos se validan en UI real (Playwright), no solo API.
- API/DB se usan como **evidencia de persistencia**, no como sustituto de PASS de pantalla.
- Multi-contexto > multi-tab del mismo storage cuando se prueba aislamiento de sesion/rol.

## 4. Fixtures aisladas

| Elemento | Regla |
|---|---|
| Prefijo PH | E2E-CERT-MASTER-{ts} (stamp run) |
| Tenant atacante | Seed TenantOther (DemoDataSeeder) — usuario contexto H |
| Datos reales | **No** modificar / **no** delete destructivo |
| CreateTenant | **GATE GAP** — no hay API publica CreateTenant / PlatformAdmin tenant CRUD. Aislamiento = PH prefix + seed TenantOther hasta que exista CRUD de tenant. Documentar en SEC-05; no fingir PASS de tenant-create. |

## 5. Inventario de arquitectura (Phase 0 summary)

### Capas (src/)

| Capa | Proyecto | Rol |
|---|---|---|
| Domain | Asambleas.Domain | Entidades, enums, lifecycle, motores quorum/voto |
| Contracts | Asambleas.Contracts | DTOs + RealtimeEventNames |
| Application | Asambleas.Application | Casos de uso, permisos, abstracciones |
| Infrastructure | Asambleas.Infrastructure | EF AsambleasDbContext, Identity, LiveKit, seed |
| Web | Asambleas.Web | Controllers, AssemblyHub, wwwroot MPA |
| Workers | Asambleas.Workers | HeartbeatWorker (placeholder) |

Flujo: Domain ← Application ← Infrastructure ← Web/Workers; Contracts compartido.

### Pantallas (21 HTML)

index.html, login.html, ctivate.html, 
eset-password.html, join.html, lobby.html, dashboard.html, ph.html, owner.html, calendar.html, genda.html, checkin.html, oting-studio.html, ssembly.html, projector.html, communications.html, convocation.html, minutes.html, evidence.html, expediente.html, ssemblies-history.html.

### Realtime / media

- **SignalR:** unico hub AssemblyHub → /hubs/assembly (Join/Leave + eventos RealtimeEventNames).
- **LiveKit:** provider Infra + meeting.js / 
oom-app.js; VPS deploy/vps/livekit.yaml.

### Roles / permisos

Roles: PlatformAdmin, TenantAdmin, PHAdmin, AssemblyPresident, AssemblySecretary, AssemblyOperator, Owner, Auditor.  
Permisos en Permissions.cs + mapa RolePermissionMap.cs (assembly, attendance incl. ttendance:force-absent, quorum, agenda, motion, vote, meeting/screenshare, recording, communications, ph/unit/owner, portal).

### Lifecycle

Assembly: Draft → Scheduled ⇄ CheckIn → InProgress ⇄ Paused → Completed (Cancelled desde Draft/Scheduled/CheckIn).  
Attendance / VotingSession / Motion statuses segun dominio.

## 6. Certificaciones historicas — NO PASS actual

Documentos CERTIFICACION_* previos (acreditacion, navegacion, votaciones, master asambleas, etc.) y AUDIT EO-* **no** se aceptan como PASS de esta corrida. Solo evidencia nueva bajo tools/e2e/master-cert-results/20260906_142448/ + actualizacion de matrices de este stamp.

## 7. Orden de ejecucion Phase 0–18

| Phase | Nombre | Objetivo operativo |
|---|---|---|
| **0** | Inventario y trazabilidad | Arquitectura, pantallas, endpoints, permisos, estados, SignalR, LiveKit, workers, docs, tests → este plan + matrices. **DONE** |
| **1** | Autenticacion y seguridad | Login/logout/me/antiforgery/deep-link/passwordless/401/403/cookies |
| **2** | CRUD PH | Crear/editar/switch/archive/delete-eval/delete solo E2E |
| **3** | CRUD unidades | CRUD, coeficientes, import, volumen, busqueda |
| **4** | CRUD propietarios | CRUD, invite, import/export, bloqueos delete |
| **5** | Relaciones owner–unidad | Ownership create/share/end/transfer |
| **6** | Coeficientes y padron | Suma 100%, diagnostico, ready/activate |
| **7** | CRUD + lifecycle asambleas | Create → check-in → start → pause → complete / cancel |
| **8** | Agenda y calendario | Events, ICS, agenda CRUD + active |
| **9** | Convocatorias | Profile/templates/send/resend/evidence |
| **10** | Acreditacion y asistencia | check-in, accredit/deaccredit bulk, force-absent, quorum |
| **11** | Sala, SignalR, LiveKit | Hub, presencia, tokens, 2P fake-media; **camara humana = BLOCKED/UAT** |
| **12** | Preguntas y mociones | Studio CRUD + present |
| **13** | Votaciones | open/cast/close/recibo/concurrencia |
| **14** | Mensajes dinamicos | Contextual guide + codigos de error |
| **15** | Resultados, acta, evidencia | minutes, evidence, expediente, recording, audit |
| **16** | Navegacion y rendimiento | hybrid-router, BF, timings |
| **17** | Responsive y accesibilidad | viewports + a11y basico |
| **18** | Eliminacion y limpieza | Delete fixtures E2E; no tocar PH reales |

Por cada defecto: evidencia → flujo → root cause → severidad → fix (si autorizado) → build → pruebas → redeploy seguro si aplica → reprobar → regresion → continuar matriz.  
**No** ocultar fallos, **no** relajar asserts, **no** declarar 100% con gate abierto.

## 8. Reglas de veredicto

| Veredicto | Condicion |
|---|---|
| 100/100 CERTIFIED — FULL BROWSER E2E — VPS VERIFIED | **Todos** los gates tecnicos PASS con evidencia de esta corrida; sin P0/P1/P2 abiertos; sin tests criticos omitidos; sin usar historicos como PASS; correcciones reprobadas; suite critica **3×** consecutivas. |
| SOFTWARE 100/100 — HUMAN UAT PENDING | Software/gates tecnicos cerrados; falta solo UAT humano camara/mic/movil real. |
| PARTIALLY CERTIFIED | Algun gate tecnico abierto o matriz incompleta con PASS parcial evidenciado. |
| NO CERTIFIED | Suite no ejecutada, matriz sin PASS, o fallos criticos sin cierre. |

El veredicto de CERTIFICACION_FINAL_MASTER_BROWSER_E2E.md **se calcula** desde la matriz (conteos PASS/FAIL/PENDING/BLOCKED), no se inventa.

**Calculo actual (Phase 0):** PASS=0 → **NO CERTIFIED**.

## 9. Bucle de autoremediacion

`
PROBAR → DETECTAR → CORREGIR → RECONSTRUIR → REDESPLEGAR → REPROBAR
`

Continuar hasta cerrar todos los gates autorizados o bloquearse en decision de usuario (schema, datos reales, secretos, etc.).

## 10. Requisitos de evidencia

Por fila PASS/FAIL de la matriz:

- Screenshot(s) y/o trace Playwright bajo tools/e2e/master-cert-results/20260906_142448/
- Request/response relevantes (sin secretos)
- Confirmacion de persistencia (API GET o query DB read-only)
- ID de defecto en REGISTRO_DEFECTOS_Y_REMEDIACIONES.md si FAIL
- Timestamp + SHA de worktree al momento de la prueba

Artefactos de Phase 0 ya presentes: tools/e2e/master-cert-results/20260906_142448/checkpoint-start.json.

## 11. Checkpoint

| Campo | Valor |
|---|---|
| Stamp | E2E-CERT-MASTER-20260906_142448 |
| Initial SHA | 8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef |
| Worktree | C:/Proyectos/NEXQUORUM |
| Branch (checkpoint) | master (ver checkpoint-start.json) |
| VPS health | HTTP 200 https://asambleas.164.68.99.83.nip.io |
| Local HTTPS | not running at start |
| Playwright path | 	ools/e2e/node_modules/playwright |

## 12. Entregables de esta corrida

1. PLAN_MAESTRO_CERTIFICACION_E2E.md (este documento)
2. MATRIZ_TRAZABILIDAD_TOTAL.md
3. MATRIZ_BROWSER_TABS_CONTEXTS.md
4. REGISTRO_DEFECTOS_Y_REMEDIACIONES.md
5–12. Stubs CERTIFICACION_*.md por dominio
13. CERTIFICACION_FINAL_MASTER_BROWSER_E2E.md
14. 	ools/e2e/master-cert/matrix-seed.json
