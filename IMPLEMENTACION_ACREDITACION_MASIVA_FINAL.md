# Implementacion final — Acreditacion masiva (OLA FINAL)

| Campo | Valor |
|---|---|
| Fecha | 2026-09-06 |
| Commit baseline | `8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef` |
| Delta | Working tree OLA FINAL (uncommitted) sobre remediacion previa |
| Companion | `ANALISIS_ACREDITACION_MASIVA_FINAL.md`, evidencias, `CERTIFICACION_FINAL_ACREDITACION_100.md` |

Consolida `IMPLEMENTACION_ACREDITACION_MASIVA.md` + cambios OLA FINAL con evidencia de codigo.

---

## 1. Arquitectura de la solucion

```
[join redeem/claim] --Issue--> IVerifiedJoinProofService (IMemoryCache, TTL 2h)
                                      |
[check-in Method=VerifiedJoinLink] --TryConsume (single-use)--> audit method OK
                                      | fail
                                      +--> audit method SelfCheckIn

[accredit-bulk / deaccredit-bulk]
  BeginExclusiveAssemblyAttendanceAsync
    BEGIN TX
    SELECT assemblies FOR UPDATE + pg_advisory_xact_lock (Npgsql)
    re-check ClientBatchId audit
    mutate participants / representations / attendance_records
    SaveChanges
    AuditService.WriteManyAsync (mismo DbContext / misma tx)
    QuorumService.RecalculateAndSnapshotAsync
    COMMIT
  PublishQuorumAsync (post-commit, fuera de atomicidad DB)
```

DI: `services.AddSingleton<IVerifiedJoinProofService, VerifiedJoinProofService>()` en `DependencyInjection.cs`.

---

## 2. P0.1 VerifiedJoin — archivos y contrato

| Archivo | Rol |
|---|---|
| `src/Asambleas.Application/Abstractions/IVerifiedJoinProofService.cs` | Issue / TryConsume / InvalidateUser / InvalidateAssemblyUser / Peek |
| `src/Asambleas.Application/Attendance/VerifiedJoinProofService.cs` | Cache key `vjl:{tenant:N}:{assembly:N}:{user:N}`; `DefaultTtl = 2h`; indice `_byUser` para invalidacion |
| `src/Asambleas.Web/Controllers/AssemblyJoinController.cs` | `Issue(...)` tras redeem y claim; **sin** acreditacion |
| `src/Asambleas.Web/Controllers/AuthController.cs` | `InvalidateUser` en login-switch (prior cookie) y logout |
| `src/Asambleas.Application/Communications/AssemblyAccessLinkService.cs` | `InvalidateAssemblyUser` al revocar link |
| `src/Asambleas.Application/Attendance/AttendanceService.cs` | `CheckInAsync` consume proof; downgrade metodo |
| `src/Asambleas.Application/Attendance/AttendanceService.Query.cs` | `GetVerifiedJoinStatus` → `VerifiedJoinStatusDto` |
| `src/Asambleas.Web/wwwroot/js/modules/join-app.js` | `sessionStorage asambleas.vjl:{assemblyId}=1` (UX only) |
| `src/Asambleas.Web/wwwroot/js/modules/checkin-app.js` | Lee hint; limpia keys legacy |
| `src/Asambleas.Web/wwwroot/join.html` | `join-app.js?v=join4` |
| `src/Asambleas.Web/wwwroot/checkin.html` | `checkin-app.js?v=accredit5` |
| `tests/.../VerifiedJoinProofServiceTests.cs` | 3/3 PASS (scope, logout, revoke) |

**Semantica de metodo de auditoria**

- Cliente puede enviar `VerifiedJoinLink` si el hint UX esta presente.
- Servidor solo conserva ese metodo si `TryConsume(tenant, assembly, user)` retorna true (single-use).
- Si no hay proof / expirado / wrong scope → `method = "SelfCheckIn"` (honestidad de audit; check-in sigue sujeto a mesa/elegibilidad).

**Endpoint de diagnostico**

- `GET /api/assemblies/{assemblyId}/attendance/verified-join-status` → `{ assemblyId, userId, hasServerProof }`.

---

## 3. P0.2 Concurrent idempotency

Implementado en `AttendanceService.Bulk.cs`:

```csharp
// BeginExclusiveAssemblyAttendanceAsync
BeginTransactionAsync
if Npgsql:
  SELECT 1 FROM assemblies WHERE "Id" = {assemblyId} FOR UPDATE
  SELECT pg_advisory_xact_lock(k1, k2)  // k1/k2 = primeros 8 bytes del Guid
```

Flujo `AccreditBulkAsync`:

1. Resolver `batchId` desde `ClientBatchId` o `Guid.NewGuid()`.
2. Abrir tx exclusiva.
3. Si hay `ClientBatchId`, `FindBulkAuditReplayAsync` **despues** del lock; si existe → Commit corto + replay response.
4. Autorizar force-absent si aplica; resolver targets; mutar en memoria.
5. SaveChanges → WriteMany → Recalculate → Commit → realtime.

Misma exclusividad en `DeaccreditBulkAsync`.

**Test:** `BulkAccreditationConcurrencyTests.Concurrent_same_batchId_is_idempotent_single_effect` — dos POST paralelos mismo `ClientBatchId`; un solo participante acreditado.

Detalle forense: `EVIDENCIA_CONCURRENCIA_ACREDITACION.md`.

---

## 4. P0.3 Atomicidad

Limite transaccional (bulk accredit/deaccredit):

| Paso | Dentro de TX? |
|---|---|
| Row lock + advisory lock | Si |
| Mutaciones EF (participants, reps, attendance_records) | Si |
| `SaveChangesAsync` negocio | Si |
| `AuditService.WriteManyAsync` → otro `SaveChanges` en mismo DbContext | Si (comparte conexion/tx ambient EF) |
| `QuorumService.RecalculateAndSnapshotAsync` | Si (mismo DbContext) |
| `tx.CommitAsync` | Si |
| `PublishQuorumAsync` | **No** — post-commit |
| `Rollback` en catch / unique violation | Si |

**No cubierto por suite automatica:** inyeccion de fallo entre SaveChanges y WriteMany, entre WriteMany y quorum, crash post-commit pre-publish.

Detalle: `EVIDENCIA_ATOMICIDAD_AUDITORIA.md`.

---

## 5. P0.4 Lifecycle

| Pieza | Detalle |
|---|---|
| Dominio | `AssemblyLifecycle.CanTransition`: `Scheduled → CheckIn`, `CheckIn → Scheduled` |
| API | `POST /api/assemblies/{id}/start-checkin`, `POST /api/assemblies/{id}/close-checkin` |
| Application | `AssemblyService.StartCheckInAsync` / `CloseCheckInAsync` (audit `CheckInDeskClosed`) |
| Retencion | Cerrar mesa **no** limpia `IsAccredited` / coeficiente efectivo |
| Tests | `AssemblyLifecycleTests` (valida CheckIn→Scheduled + invalidos); `Close_checkin_desk_returns_to_scheduled` integracion |

---

## 6. Remediacion previa (sigue vigente)

### Anti-autoacreditacion

- Redeem/claim: solo auth + enrol + (OLA FINAL) Issue proof.
- Acreditacion = accion explicita (`POST .../attendance/check-in` o mesa bulk/operator).

### Ausentes

- `AllEligible` sin `IncludeAbsentInvitees` → no apunta `Registered`.
- Force: permiso `attendance:force-absent` + frase `ACREDITAR AUSENTES` + motivo.
- UI primaria: **Acreditar seleccionados verificados**.
- Presidente/mesa: sin permiso force-absent (unit + integration).

### Batch optimizado

- `ResolveEligibleClaimsBulkAsync` (ownerships+powers).
- Participants tracked en un load; reps/records en memoria.
- 1x SaveChanges negocio, 1x WriteMany, 1x Recalculate.
- Idempotencia `ClientBatchId` via CorrelationId en auditoria `BulkAccreditation`.

### Deacreditacion batch

- Preview + execute; motivo obligatorio; bloqueo con votacion abierta donde aplica.
- `IsActive=false` en snapshots de representacion; ownerships/powers intactos.

### UX mesa

- Tabla + toolbar; resumen convocados/acreditados/unidades/coeficiente/presentes/mesa.
- Quorum invalido: banner CONFIGURACION DE COEFICIENTES INVALIDA.

---

## 7. P1 — endpoints y UI

### Attendance (`AttendanceController`)

| Metodo | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/api/assemblies/{id}/attendance/participants` | attendance:view | Sin query = lista full (compat); con `skip`/`take`/`q`/`status` = `ParticipantsPageDto` |
| GET | `/api/assemblies/{id}/attendance/participant-ids` | attendance:view | IDs filtrados para select-all servidor |
| GET | `/api/assemblies/{id}/attendance/verified-join-status` | attendance:view | Peek proof |
| GET | `/api/assemblies/{id}/attendance/exceptions` | attendance:manage | Bandeja observados |
| POST | `/api/assemblies/{id}/attendance/exceptions/{userId}/resolve` | attendance:manage | Accion + motivo/nota |
| POST | `/api/assemblies/{id}/attendance/check-in` | attendance:view | Self / VerifiedJoin |
| POST | `/api/assemblies/{id}/attendance/participants/{userId}/accredit` | attendance:manage | Operator 1 |
| POST | `/api/assemblies/{id}/attendance/accredit-bulk` | attendance:manage | Bulk |
| POST | `/api/assemblies/{id}/attendance/accredit-bulk/preview` | attendance:manage | Preview |
| POST | `/api/assemblies/{id}/attendance/deaccredit-bulk` | attendance:manage | Bulk |
| POST | `/api/assemblies/{id}/attendance/deaccredit-bulk/preview` | attendance:manage | Preview |
| POST | `/api/assemblies/{id}/attendance/participants/{userId}/deaccredit` | attendance:manage | 1 |

### Quorum (`QuorumController`)

| Metodo | Ruta | Permiso |
|---|---|---|
| GET | `/api/assemblies/{id}/quorum/padron-diagnostic` | quorum:view |
| GET | `/api/assemblies/{id}/quorum/padron.csv` | quorum:view |

### Assemblies

| Metodo | Ruta |
|---|---|
| POST | `/api/assemblies/{id}/start-checkin` |
| POST | `/api/assemblies/{id}/close-checkin` |

### Join / Auth (VerifiedJoin)

| Metodo | Ruta | Efecto acreditacion |
|---|---|---|
| POST | `/api/join/redeem` | **Ninguno** — Issue proof |
| POST | `/api/join/claim` | **Ninguno** — Issue proof |
| POST | `/api/auth/login` | Invalida proofs del user previo |
| POST | `/api/auth/logout` | Invalida proofs del user |

### UI

- `checkin.html`: seccion bandeja excepciones (`#exceptions-root`), link CSV padron, paginacion/participant-ids en `checkin-app.js`.
- Force-absent UI gated por `attendance:force-absent`.

### Contracts / domain tocados (OLA FINAL)

- `AttendanceExceptionDtos.cs`, `RepresentationDtos.cs` (`ClientBatchId`, force-absent fields).
- `Permissions.AttendanceForceAbsent`.
- `AssemblyLifecycle` CheckIn⇄Scheduled.
- DTOs quorum padron (`CoefficientPadronDtos`).

---

## 8. Rendimiento (local PostgreSQL)

De `docs/AUDIT/acreditacion-bench-300.json` (escrito por `Scale_300_selected_bulk_under_5_seconds`):

| Metrica | Valor | Assert |
|---|---|---|
| records | 300 | — |
| previewMs | 255 | < 2000 |
| accreditMs | 495 | < 5000 |
| seedMs | 268 | < 60000 |
| saveChanges | 1 | diseno |
| provider | PostgreSQL | — |
| atUtc | 2026-09-06T17:54:35.0939546+00:00 | — |

Scale 1000: **no ejecutado**. SQL query counts / working set: **no instrumentados**.

---

## 9. Tests vinculados

| Area | Tests | Resultado sesion |
|---|---|---|
| Bulk + close + force + scale + deaccredit | `BulkAccreditationTests` (6) | PASS (parte de 9/9) |
| Concurrency + padron + page | `BulkAccreditationConcurrencyTests` (3) | PASS |
| VerifiedJoin | `VerifiedJoinProofServiceTests` (3) | PASS |
| Force-absent RBAC map | `ForceAbsentPermissionTests` | PASS |
| Lifecycle | `AssemblyLifecycleTests` | PASS (incl. CheckIn→Scheduled) |
| Security suite | `SecurityTests` | 17/17 PASS |
| Unit slice agregado | — | 37/37 PASS |
| Web Release | build | OK |

---

## 10. Riesgos de implementacion / deuda

1. Proof store in-process (`IMemoryCache` singleton): multi-instance requiere Redis/sticky o aceptar downgrade SelfCheckIn.
2. Fault-injection atomicidad no automatizada.
3. Matriz concurrencia incompleta (ver evidencia concurrencia).
4. VPS deploy OLA FINAL pendiente.
5. UAT movil humano pendiente.
6. Regresion Voting/LiveKit no re-corrida completa esta sesion.
