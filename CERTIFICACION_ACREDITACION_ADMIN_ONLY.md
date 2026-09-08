# Certificación — Acreditación exclusiva administrativa

Fecha: 2026-09-07  
Resultado: **NO CERTIFICADO** (backend + UI corregidos; faltan E2E Browser Tab completos y UAT móvil/VPS)

## 1. Diagnóstico de la causa original

1. **Autoacreditación del propietario**: `POST /api/assemblies/{id}/attendance/check-in` estaba autorizado con `attendance:view` (rol Owner lo tiene). El botón «Registrar mi asistencia» y el flujo VerifiedJoinLink terminaban en `AccreditInternalAsync`.
2. **Acreditación ≡ presencia/quórum**: al acreditar se forzaba `AttendanceStatus=CheckedIn`, por lo que el coeficiente entraba al quórum aunque el propietario no hubiera ingresado a la sala.
3. **Lobby sin tiempo real**: el propietario no recibía `participantUpdated` / aviso al ser acreditado; el copy le pedía «acreditarse» o ir al check-in.
4. **DTO incompleto**: `AccreditedByUserId` existía en dominio pero no se exponía en `AssemblyParticipantDto`.

## 2. Archivos modificados (principales)

### Backend
- `src/Asambleas.Application/Attendance/AttendanceService.cs`
- `src/Asambleas.Application/Attendance/AttendanceService.Bulk.cs`
- `src/Asambleas.Web/Controllers/AttendanceController.cs`
- `src/Asambleas.Web/Middleware/ExceptionHandlingMiddleware.cs`
- `src/Asambleas.Domain/Attendance/AttendanceCodes.cs`
- `src/Asambleas.Contracts/Assemblies/AssemblyDtos.cs`
- `src/Asambleas.Contracts/Realtime/RealtimeEventNames.cs`
- `src/Asambleas.Contracts/Realtime/AccreditationChangedDto.cs`
- `src/Asambleas.Application/Abstractions/IAssemblyRealtimePublisher.cs`
- `src/Asambleas.Web/Realtime/SignalRAssemblyRealtimePublisher.cs`
- `src/Asambleas.Application/Common/Mapping.cs`

### Frontend
- `wwwroot/js/modules/checkin-app.js`, `checkin.html`
- `wwwroot/js/modules/lobby-app.js`, `lobby.html`
- `wwwroot/js/modules/room-app.js`, `signalr-client.js`, `contextual-guide.js`
- `wwwroot/js/i18n/es-PA.js`, `en.js`

### Pruebas
- `tests/.../AdminOnlyAccreditationTests.cs` (nuevo)
- `tests/.../Infrastructure/AttendanceTestHelpers.cs` (nuevo)
- Ajustes en quorum, voting, bulk, audit, seal, security, E2E HTTP

## 3. Reglas funcionales implementadas

| Regla | Implementación |
|-------|----------------|
| Solo admin acredita | `attendance:manage` en `check-in` y `accredit*`; servicio `EnsureCanManageAttendance()` |
| Acreditar = automático (validación + estado + reps + audit + SignalR) | `AccreditInternalAsync` / bulk |
| Acreditación ≠ presencia/quórum | No setea `CheckedIn`; quórum solo con presencia efectiva |
| Presencia al ingresar | Hub `MarkConnected` + `POST .../attendance/presence` |
| Anti-duplicado | Idempotente si ya `IsAccredited` |
| Revocación auditada | Motivo + estados previos/nuevos + evento `accreditationChanged` |
| Mensaje al propietario | Evento `accreditationChanged` + toast en lobby/sala |
| UI propietario sin auto-acreditar | Botón self oculto; guía sin «Ir a acreditarme» |

## 4. Controles de seguridad

- Policy ASP.NET: `POST check-in` → `attendance:manage` (Owner → **403**).
- Defensa en servicio: `SELF_ACCREDITATION_FORBIDDEN` → 403.
- `POST .../accredit` y bulk ya requerían `attendance:manage`.
- `POST .../presence` no acredita; exige ya acreditado.
- Cliente no puede “inventar” VerifiedJoinLink para acreditarse.

## 5. Pruebas ejecutadas (local)

Conexión: `asambleas_tests` (PostgreSQL local).

| Suite | Resultado |
|-------|-----------|
| `AdminOnlyAccreditationTests` (5) | PASS |
| `QuorumIntegrationTests` | PASS |
| `BulkAccreditationTests.Scale_300` (coeficiente post-acred = 0) | PASS |
| Bloque attendance/voting/room/audit relacionado (24 tests previos) | PASS |
| Security: ManipulatedId / MeetingToken / cross-tenant check-in | PASS (6) |

**No ejecutado en esta sesión (bloquea CERTIFICADO):**
- Browser Tab E2E completo de los 17 escenarios UI (presidente acredita → toast propietario en vivo, móvil, reconexión visual, VPS).
- E2E HTTP `AssemblyMeetingE2ETests` completo (adaptado, no corrido aquí).
- UAT humano responsive en teléfono.
- Despliegue VPS de este cambio.

## 6. Evidencias visuales

Pendientes de captura Browser Tab. Comportamiento esperado:

- **Admin (`checkin.html`)**: Acreditar → toast «Acreditado», roster actualizado sin reload duro; sin «Registrar mi asistencia» para propietarios.
- **Propietario (lobby)**: banner «pendiente de validación…»; al acreditar mesa → SignalR `accreditationChanged` + mensaje aprobado; sin enlace a auto-acreditar.

## 7. Riesgos / pendientes reales

1. Operadores que confiaban en self check-in como atajo deben usar **Acreditar** (o check-in solo con `attendance:manage`).
2. Quórum en vivo puede verse más bajo hasta que los acreditados **entren** a la sala (comportamiento correcto por especificación).
3. Bulk 300 ya no sube coeficiente de quórum hasta presencia — benches/docs antiguos que esperaban 100% post-bulk quedan obsoletos.
4. Falta certificar Browser Tab + móvil + VPS.

## 8. Resultado final

# NO CERTIFICADO

Criterios críticos de producto (admin-only, separación acred/presencia, 403 owner, SignalR evento) están implementados y cubiertos por tests de integración/seguridad.  
Falta la batería Browser Tab + evidencias visuales + cierre móvil/VPS exigidos para declarar `CERTIFICADO`.
