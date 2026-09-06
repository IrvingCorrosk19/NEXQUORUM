# Matriz de trazabilidad total — Master Browser E2E

**Stamp:** E2E-CERT-MASTER-20260906_142448  
**Initial SHA:** 8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef  
**Evidence dir:** tools/e2e/master-cert-results/20260906_142448  
**Base URL (default):** https://asambleas.164.68.99.83.nip.io  
**Generated:** Phase 0 seed — suite not executed yet.

## Reglas

- Todo Estado inicia en PENDING salvo gaps humanos explicitos (BLOCKED).
- Historicos CERTIFICACION_* **no** cuentan como PASS de esta corrida.
- Actualizar filas solo con evidencia bajo tools/e2e/master-cert-results/20260906_142448/.
- GATE GAP: no existe API publica CreateTenant — aislamiento via prefijo PH E2E-CERT-MASTER-{ts} + seed TenantOther (SEC-05).

## Resumen

| Metrica | Valor |
|---|---|
| Filas totales | 112 |
| PENDING | 111 |
| BLOCKED | 1 |
| PASS | 0 |
| FAIL | 0 |

## Matriz

| ID | Modulo | Flujo | Rol | Pantalla | Endpoint | Persistencia | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|
| AUTH-01 | Auth | Login valido | All | index.html / login.html | POST /api/auth/login | Cookie sesion + claims | Browser login demo credentials | PENDING |
| AUTH-02 | Auth | Login invalido | All | login.html | POST /api/auth/login | Sin sesion | Credenciales incorrectas → error claro, no cookie | PENDING |
| AUTH-03 | Auth | Logout | All | dashboard.html | POST /api/auth/logout | Sesion invalidada | Logout + redirect + /api/auth/me 401 | PENDING |
| AUTH-04 | Auth | Sesion / me | All | — | GET /api/auth/me | Claims tenant/PH/roles | Tras login, me refleja usuario y permisos | PENDING |
| AUTH-05 | Auth | Antiforgery | All | — | GET /api/auth/antiforgery | Token antiforgery | Mutaciones POST con token; rechazo sin token | PENDING |
| AUTH-06 | Auth | Forgot password | Owner | reset-password.html | POST /api/auth/forgot-password | Token reset (dev mailbox) | Flujo forgot → preview → complete | PENDING |
| AUTH-08 | Auth | Deep link sin sesion | Owner | join.html / assembly.html | — | Redirect login | URL protegida redirige; no leak datos | PENDING |
| AUTH-09 | Auth | Admin page como Owner | Owner | ph.html | GET /api/ph | 403 backend | UI oculta + API niega | PENDING |
| AUTH-10 | Auth | URL manipulation assembly | Owner | assembly.html | GET /api/assemblies/{id} | 403/404 | GUID otro tenant/PH no expone datos | PENDING |
| AUTH-11 | Auth | Passwordless redeem valido | Owner | join.html | POST /api/join/redeem | Enrollment + proof | Redeem link valido → claim/enrol | PENDING |
| AUTH-12 | Auth | Passwordless expirado/revocado | Owner | join.html | POST /api/join/redeem | Rechazo | Link expirado/revocado no enrola | PENDING |
| AUTH-13 | Auth | Activate invite | Owner | activate.html | POST /api/ph/invitations/activate | User activo | Invitacion owner → activate | PENDING |
| PH-01 | PH | Crear PH E2E | PHAdmin/TenantAdmin | ph.html | POST /api/ph | PropertyHorizontal | Crear PH nombre E2E-CERT-MASTER-{ts} | PENDING |
| PH-02 | PH | Validar campos obligatorios | PHAdmin | ph.html | POST /api/ph | Sin persistencia | Submit vacio → errores UI/API | PENDING |
| PH-03 | PH | Editar PH | PHAdmin | ph.html | PUT /api/ph/{id} | PH actualizado | Cambiar nombre/config | PENDING |
| PH-04 | PH | Switch PH context | PHAdmin | ph.html / dashboard | POST /api/ph/switch | Membership activa | Cambio PH + aislamiento datos | PENDING |
| PH-05 | PH | Consultar resumen/readiness | PHAdmin | ph.html | GET /api/ph/{id}/readiness | Read model | Readiness refleja unidades/owners | PENDING |
| PH-06 | PH | Archivar/desactivar | PHAdmin | ph.html | POST /api/ph/{id}/deactivate | PhLifecycle Inactive | Desactivar PH E2E | PENDING |
| PH-08 | PH | Delete evaluation | PHAdmin | ph.html | GET /api/ph/{id}/delete-evaluation | Eval flags | Bloqueo con dependencias | PENDING |
| PH-09 | PH | Eliminar PH E2E permitido | PHAdmin | ph.html | DELETE /api/ph/{id} | Hard delete solo E2E | Eliminar unicamente fixture E2E sin historico critico | PENDING |
| UNIT-01 | Unidades | Crear unidad | PHAdmin | ph.html | POST /api/ph/{id}/units | Unit | Crear unidad con codigo/coef | PENDING |
| UNIT-02 | Unidades | Editar unidad | PHAdmin | ph.html | PUT /api/ph/{id}/units/{unitId} | Unit | Editar codigo/descripcion | PENDING |
| UNIT-03 | Unidades | Activar/desactivar | PHAdmin | ph.html | POST .../units/{unitId}/active | IsActive | Toggle activo | PENDING |
| UNIT-04 | Unidades | Codigo duplicado | PHAdmin | ph.html | POST /api/ph/{id}/units | Rechazo | Duplicate code → error | PENDING |
| UNIT-05 | Unidades | Coeficiente invalido | PHAdmin | ph.html | POST/PUT units | Rechazo | Negativo / >100 / formato invalido | PENDING |
| UNIT-06 | Unidades | Eliminar sin dependencias | PHAdmin | ph.html | DELETE/eval path | Unit removed | Eliminar unidad E2E limpia | PENDING |
| UNIT-07 | Unidades | Bloquear delete con owner | PHAdmin | ph.html | delete-evaluation | Blocked | Unidad con ownership no elimina | PENDING |
| UNIT-08 | Unidades | Import plantilla | PHAdmin | ph.html | GET /api/ph/{id}/import/template | File | Descargar template | PENDING |
| UNIT-09 | Unidades | Import analyze+commit | PHAdmin | ph.html | POST import/analyze+commit | Units bulk | Import filas validas | PENDING |
| UNIT-10 | Unidades | Import errores por fila | PHAdmin | ph.html | POST import/analyze | Error report | Filas invalidas no commit | PENDING |
| OWN-01 | Propietarios | Crear propietario | PHAdmin | ph.html | POST /api/ph/{id}/owners | Owner | Crear owner E2E | PENDING |
| OWN-02 | Propietarios | Editar propietario | PHAdmin | ph.html | PUT /api/ph/{id}/owners/{ownerId} | Owner | Editar datos | PENDING |
| OWN-03 | Propietarios | Desactivar/reactivar | PHAdmin | ph.html | POST deactivate/reactivate | OwnerLifecycle | Ciclo lifecycle | PENDING |
| OWN-04 | Propietarios | Correo duplicado | PHAdmin | ph.html | POST owners | Rechazo | Email duplicado | PENDING |
| OWN-05 | Propietarios | Delete evaluation + delete | PHAdmin | ph.html | GET delete-evaluation + DELETE | Blocked/Allowed | Bloqueo con historico; delete E2E limpio | PENDING |
| OWN-06 | Propietarios | Invite owner | PHAdmin | ph.html | POST .../owners/{id}/invite | Invitation token | Invitar + preview activate | PENDING |
| OWN-10 | Propietarios | Portal self profile | Owner | owner.html | GET /api/ph/me/owner-profile | Self only | Owner ve solo sus datos | PENDING |
| REL-01 | Ownership | Crear ownership | PHAdmin | ph.html | POST /api/ph/{id}/ownerships | Ownership | Vincular owner-unidad | PENDING |
| REL-02 | Ownership | Cambiar share % | PHAdmin | ph.html | PUT .../ownerships/{id}/share | SharePercent | Ajustar participacion | PENDING |
| REL-03 | Ownership | End ownership | PHAdmin | ph.html | POST .../ownerships/{id}/end | Ended | Finalizar vinculo | PENDING |
| REL-04 | Ownership | Transfer | PHAdmin | ph.html | POST .../ownerships/transfer | Transfer atomic | Transferencia entre owners | PENDING |
| COEF-01 | Coeficientes | Consultar coeficientes | PHAdmin | ph.html | GET /api/ph/{id}/coefficients | Sum % | Suma coeficientes visible | PENDING |
| COEF-02 | Coeficientes | Padron diagnostico | Operator | checkin.html | GET .../quorum/padron-diagnostic | Diagnostic | Suma !=100 → CONFIGURACION INVALIDA | PENDING |
| COEF-03 | Coeficientes | Padron CSV | Operator | checkin.html | GET .../quorum/padron.csv | File | Export padron | PENDING |
| COEF-04 | Coeficientes | Ready for assembly | PHAdmin | ph.html | POST /api/ph/{id}/ready | PhLifecycle | Ready solo si padron valido | PENDING |
| ASM-01 | Asambleas | Crear asamblea | President | calendar.html / dashboard | POST /api/assemblies | Assembly Draft/Scheduled | Crear asamblea E2E en PH fixture | PENDING |
| ASM-02 | Asambleas | Editar/reprogramar | President | calendar.html | POST .../reschedule | Schedule + history | Reschedule + impact | PENDING |
| ASM-03 | Asambleas | Cancelar | President | calendar.html | POST .../cancel | Cancelled | Cancel Draft/Scheduled/CheckIn | PENDING |
| ASM-04 | Asambleas | Start check-in | Operator | checkin.html | POST .../start-checkin | Status CheckIn | Abrir mesa | PENDING |
| ASM-06 | Asambleas | Start assembly | President | assembly.html | POST .../start | InProgress | Iniciar asamblea | PENDING |
| ASM-07 | Asambleas | Pause/Resume | President | assembly.html | POST pause/resume | Paused/InProgress | Pausa y reanudacion | PENDING |
| ASM-08 | Asambleas | Complete | President | assembly.html | POST .../complete | Completed | Cierre formal | PENDING |
| ASM-09 | Asambleas | Dashboard/readiness | President | dashboard.html | GET .../dashboard + readiness | Read models | Panel asamblea | PENDING |
| ASM-11 | Asambleas | Historico | Auditor | assemblies-history.html | GET /api/assemblies | List Completed | Consulta historica | PENDING |
| CAL-01 | Calendario | List events | President | calendar.html | GET /api/calendar/events | Events | Ver eventos PH | PENDING |
| CAL-03 | Calendario | ICS export | President | calendar.html | GET .../calendar.ics | ICS file | Descarga ICS | PENDING |
| CAL-05 | Agenda | CRUD agenda items | President | agenda.html | GET/POST .../agenda | AgendaItem | Crear/listar agenda | PENDING |
| CAL-06 | Agenda | Set active agenda | President | agenda.html / assembly | POST .../agenda/active | Active item | Activar punto + SignalR | PENDING |
| CONV-01 | Convocatorias | Comms profile | PHAdmin | communications.html | GET/PUT .../communications/ph/{id}/profile | Profile | Config perfil | PENDING |
| CONV-04 | Convocatorias | Crear/enviar | President | convocation.html | POST .../convocations | Convocation + links | Enviar convocatoria fixture | PENDING |
| CONV-05 | Convocatorias | Resend | President | convocation.html | POST resend | Resend audit | Reenvio controlado | PENDING |
| CONV-06 | Convocatorias | Evidence view | Auditor | evidence.html | GET convocations evidence | Evidence rows | Evidencia envio | PENDING |
| ACC-01 | Acceso | Join preview | Owner | join.html | GET /api/join/preview | Token meta | Preview sin secret leak | PENDING |
| ACC-02 | Acceso | Redeem + claim | Owner | join.html | POST redeem/claim | Participant enrolled | Enrol sin auto-acreditar | PENDING |
| ACC-04 | Acceso | Verified join proof | Owner | join.html → checkin | verified-join-status | Server proof | Proof ligado user/asm/tenant (no bool global) | PENDING |
| ACC-05 | Acceso | Vigencia enlace | Owner | join.html | redeem | Expired reject | Reprogramacion revoca enlaces viejos | PENDING |
| ROOM-01 | Acreditacion | Check-in self | Owner | checkin.html / assembly | POST .../attendance/check-in | Attendance CheckedIn | Self check-in permitido | PENDING |
| ROOM-02 | Acreditacion | Accredit single | Operator | checkin.html | POST .../participants/{id}/accredit | Present + quorum | Acreditar uno | PENDING |
| ROOM-03 | Acreditacion | Accredit bulk preview | Operator | checkin.html | POST accredit-bulk/preview | Preview counts | Preview masivo | PENDING |
| ROOM-04 | Acreditacion | Accredit bulk commit | Operator | checkin.html | POST accredit-bulk | Bulk Present + 1 SaveChanges | Batch 300 atomic | PENDING |
| ROOM-05 | Acreditacion | Force absent gate | Operator | checkin.html | POST accredit-bulk + force-absent | Audit + phrase | Ausentes requieren permiso+frase | PENDING |
| ROOM-06 | Acreditacion | Deaccredit bulk | Operator | checkin.html | POST deaccredit-bulk | Status revert | Deacreditar seleccion | PENDING |
| ROOM-07 | Acreditacion | Exceptions resolve | Operator | checkin.html | POST exceptions/{id}/resolve | Exception closed | Resolver excepcion | PENDING |
| ROOM-08 | Quorum | Quorum live | Operator | checkin.html / assembly | GET .../quorum + SignalR quorumUpdated | QuorumSnapshot | % coherente con acreditados | PENDING |
| ROOM-10 | Sala | Join AssemblyHub | All room | assembly.html | /hubs/assembly JoinAssembly | SignalR group | Join group assembly:{id} | PENDING |
| ROOM-11 | Sala | Presence participantUpdated | All room | assembly.html | SignalR participantUpdated | Realtime | Presencia multi-contexto | PENDING |
| ROOM-12 | Sala | LiveKit token join | Owner | lobby.html → assembly | POST/GET meeting token | LiveKit JWT | Token + connect room | PENDING |
| ROOM-13 | Sala | LiveKit fake-media 2p | Owner+Owner | assembly.html | LiveKit SFU | Tracks (fake) | 2 contextos se ven (fake devices) | PENDING |
| ROOM-14 | Sala | Human camera/mic UAT | Owner+Owner | assembly.html | LiveKit real A/V | Hardware | Camara/mic real multi-participante | BLOCKED |
| ROOM-16 | Sala | Reconnect SignalR | Owner | assembly.html | hub reconnect | Rehydrate | Reconnect + room-state | PENDING |
| ROOM-17 | Sala | Speakers queue | Owner/President | assembly.html | POST speakers/* | SpeakerRequest | Request/grant/complete | PENDING |
| MOT-01 | Mociones | Crear motion | President | voting-studio.html | POST .../motions | Motion Draft | Crear pregunta | PENDING |
| MOT-02 | Mociones | Editar/present | President | voting-studio.html / assembly | PUT/POST motions | Presented | Presentar mocion | PENDING |
| VOTE-01 | Votaciones | Open session | President | assembly.html | POST .../voting/open | VotingSession Open | Abrir votacion | PENDING |
| VOTE-02 | Votaciones | Cast vote | Owner | assembly.html | POST .../voting/{id}/cast | Vote + receipt | Emitir voto + recibo | PENDING |
| VOTE-03 | Votaciones | Double cast blocked | Owner | assembly.html | POST cast | Reject | Segundo voto rechazado | PENDING |
| VOTE-04 | Votaciones | Close session | President | assembly.html | POST .../close | Closed + results | Cerrar + tally | PENDING |
| VOTE-06 | Votaciones | My status/receipt | Owner | assembly.html | GET my-status/my-receipt | Receipt | Persistencia tras reload | PENDING |
| VOTE-07 | Votaciones | Open list | All | assembly.html | GET .../voting/open | Open sessions | Lista abiertas sync SignalR | PENDING |
| VOTE-10 | Votaciones | Concurrent cast 2 owners | Owner A+B | assembly.html multi-ctx | cast parallel | 2 Votes | Concurrencia sin doble conteo | PENDING |
| MSG-01 | Mensajes | Contextual guide room | President | assembly.html | — | Guide state | Guia refleja lifecycle real | PENDING |
| MSG-02 | Mensajes | Voting error codes | Owner | assembly.html | cast errors | Mapped codes | explainBlockCode sin Error generico | PENDING |
| RES-01 | Resultados | Minutes | Secretary | minutes.html | GET .../minutes | Minutes sealed | Acta post-complete | PENDING |
| RES-02 | Resultados | Evidence pack | Auditor | evidence.html | GET .../evidence | Evidence | Paquete evidencias | PENDING |
| RES-03 | Resultados | Expediente | Auditor | expediente.html | GET recording/expediente | Expediente | Descarga/consulta | PENDING |
| RES-04 | Resultados | Recording control | President | assembly.html | recording APIs | Recording rows | Start/stop (synth OK; real egress nota) | PENDING |
| RES-05 | Resultados | Audit trail | Auditor | assembly / API | GET .../audit | AuditEvent | Eventos acreditacion/voto | PENDING |
| NAV-01 | Navegacion | Hybrid soft routes | PHAdmin | dashboard/ph/agenda/checkin | — | SPA-like cluster | Soft nav sin full reload indebido | PENDING |
| NAV-02 | Navegacion | Hard enter room | Owner | assembly.html | — | Hard navigation | Entrada sala hard + hydrate | PENDING |
| NAV-03 | Navegacion | PH switch mid-nav | PHAdmin | ph.html multi-tab | POST /api/ph/switch | Context | Dos PH sin cruce datos | PENDING |
| NAV-05 | Rendimiento | Nav timing budget | PHAdmin | ph/dashboard | HAR/perf | Metrics | Postbacks/nav dentro presupuesto | PENDING |
| A11Y-02 | Accesibilidad | Labels forms PH | PHAdmin | ph.html | — | Labels | Inputs con label asociado | PENDING |
| A11Y-04 | Responsive | Viewports 360-1920 | All | key screens | — | Screenshots | 360/768/1366/1920 sin overflow critico | PENDING |
| A11Y-05 | Responsive | Mobile voting UX | Owner | assembly.html | cast | Sheet | Usable en 360x800 | PENDING |
| DEL-01 | Limpieza | Delete owner E2E | PHAdmin | ph.html | DELETE owners | Removed | Solo fixtures E2E | PENDING |
| DEL-02 | Limpieza | Delete PH E2E | PHAdmin | ph.html | DELETE /api/ph/{id} | Removed | Cleanup al final suite | PENDING |
| DEL-03 | Limpieza | No delete PH real | PHAdmin | ph.html | delete-evaluation | Blocked | PH produccion/demo no destructivo | PENDING |
| SEC-01 | Seguridad | Cross-tenant read | TenantOther attacker | API | GET assemblies/ph | 403/404 | Contexto H no lee Tenant Ocean | PENDING |
| SEC-02 | Seguridad | Cross-PH switch abuse | PHAdmin | API | POST switch + GET | 403 | PH de otro tenant inaccesible | PENDING |
| SEC-03 | Seguridad | Vote without accredit | Owner | assembly.html | POST cast | Reject code | No voto sin acreditacion | PENDING |
| SEC-04 | Seguridad | Force-absent sin permiso | Owner | checkin.html | accredit-bulk | 403 | attendance:force-absent enforced | PENDING |
| SEC-05 | Seguridad | CreateTenant API absent | PlatformAdmin | — | N/A CreateTenant | GATE GAP | Sin API publica CreateTenant; aislamiento por PH prefix + seed TenantOther | PENDING |

