# Evidencia — Atomicidad negocio / auditoria / quorum

| Campo | Valor |
|---|---|
| Fecha | 2026-09-06 |
| Baseline | `8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef` + OLA FINAL uncommitted |
| Codigo primario | `AttendanceService.Bulk.cs` (`AccreditBulkAsync`, `DeaccreditBulkAsync`) |
| Audit | `AuditService.WriteManyAsync` |
| Quorum | `QuorumService.RecalculateAndSnapshotAsync` |

---

## 1. Definicion del limite transaccional

Para **acreditacion masiva** y **desacreditacion masiva**, la atomicidad DB exigida es:

> O bien persisten juntos: (a) mutaciones de asistencia/representacion, (b) eventos de auditoria del batch, (c) snapshot de quorum recalculado;  
> o bien **ninguno** de (a)(b)(c) queda visible tras rollback.

**Fuera** del limite atomico DB (aceptado):

- Publicacion realtime SignalR / quorum push (`PublishQuorumAsync`) — **despues** de `Commit`.
- Side-effects de cache VerifiedJoin (no aplica al bulk).

---

## 2. Secuencia real en codigo (AccreditBulk)

Tras `BeginExclusiveAssemblyAttendanceAsync` y trabajo en memoria:

```text
try:
  await _db.SaveChangesAsync(...)           # (a) participants, reps, attendance_records
  auditEvents.Add(BulkAccreditation ...)
  await _audit.WriteManyAsync(auditEvents)  # (b) insert AuditEvents + SaveChanges
  quorum = await _quorum.RecalculateAndSnapshotAsync(..., "BulkCheckIn")  # (c)
  await tx.CommitAsync(...)
  await _realtime.PublishQuorumAsync(...)   # POST-COMMIT
  return BulkAccreditResponse
catch DbUpdateException (unique):
  Rollback → DomainException RepresentationConflict
catch *:
  Rollback → rethrow
```

`DeaccreditBulkAsync` espeja el mismo orden con trigger `"BulkDeaccredit"` / evento `BULK_DEACCREDITATION`.

Comentario XML en `BeginExclusiveAssemblyAttendanceAsync`:

> Business SaveChanges + audit WriteMany + quorum snapshot share this transaction.

---

## 3. Por que WriteMany / Quorum quedan en la misma TX

- `AttendanceService` y `AuditService` / `QuorumService` comparten el mismo `IAsambleasDbContext` scoped por request.
- EF Core: `BeginTransactionAsync` en ese DbContext hace que posteriores `SaveChangesAsync` en la misma conexion participen de la transaccion ambient.
- `WriteManyAsync` solo agrega `AuditEvent` y llama `SaveChangesAsync` — no abre otra transaccion.
- `RecalculateAndSnapshotAsync` escribe snapshot via el mismo contexto (asumido path estandar del servicio; sin `TransactionScope` separado observado en este flujo).

Si en el futuro un servicio abriera `BeginTransaction` anidado o otra conexion, el limite se romperia — riesgo de regresion a vigilar.

---

## 4. Que se audita en el batch

Por participante exitoso: `AuditEventType.ParticipantAccredited` (o deaccredited) con `CorrelationId = batchId`.

Al final: `AuditEventType.BulkAccreditation` (o `BULK_DEACCREDITATION`) con metadata:

- `BatchId`, `Requested`, `Succeeded`, `Failed`, `Skipped`
- Flags `AllEligible` / `IncludeAbsentInvitees` / `AbsentReason` (accredit)
- `Method`, `CoefficientBefore`

Idempotencia: busqueda de audit `BulkAccreditation` por `CorrelationId = ClientBatchId` **despues** del lock (ver evidencia concurrencia).

---

## 5. Realtime post-commit — semantica de fallo

Si `Commit` OK y `PublishQuorumAsync` falla:

- DB consistente (a+b+c persistidos).
- Clientes pueden ver quorum stale hasta refresh / siguiente evento.
- **No** es rollback de negocio (correcto: no se debe deshacer acreditacion por fallo de bus).

Si falla **antes** de Commit (p.ej. excepcion en Recalculate):

- `catch` → `RollbackAsync` → (a)(b)(c) no deben quedar committed.

---

## 6. Matriz de inyeccion de fallos (requerida vs estado)

| # | Fallo inyectado | Esperado | Automatizado | Gate |
|---|---|---|---|---|
| F1 | Excepcion antes de SaveChanges negocio | Nada persistido; sin audit batch | No suite dedicada | **FAIL / PENDING** |
| F2 | Excepcion entre SaveChanges y WriteMany | Rollback; sin participantes acreditados ni audit | No | **FAIL / PENDING** |
| F3 | Excepcion dentro de WriteMany post-insert parcial | Rollback completo | No | **FAIL / PENDING** |
| F4 | Excepcion en RecalculateAndSnapshot | Rollback; sin acreditacion huérfana sin quorum | No | **FAIL / PENDING** |
| F5 | Excepcion en Commit | Rollback driver-level | No | **FAIL / PENDING** |
| F6 | Excepcion en PublishQuorum post-commit | DB OK; realtime degradado | No | **PENDING** (doc OK) |
| F7 | Unique violation representation | Rollback + DomainException | Codigo catch; stress limitado | **PARTIAL** |
| F8 | Cancelacion CancellationToken mid-batch | Rollback / no commit parcial | No | **PENDING** |

**Gate atomicidad / failure matrix:** **PARTIAL / FAIL** para "full failure matrix".

Evidencia positiva disponible (no sustituye F1–F5):

- Happy path Scale_300: 300 acreditados + coeficiente ~100 (implica quorum snapshot coherente).
- Deaccredit_bulk_and_reaccredit: reps historicas + powers vivos (consistencia de negocio).
- Concurrent same batchId: un solo efecto (implica no doble commit parcial visible).

---

## 7. Limites fuera de bulk

Check-in individual (`AccreditInternalAsync`) y accredit operator 1:1 pueden tener orden audit/quorum distinto; este documento certifica el **camino masivo** OLA FINAL. Extender la misma tx exclusiva a check-in 1:1 es mejora opcional (no reclamada como PASS aqui).

VerifiedJoin `TryConsume` es best-effort memoria: si check-in falla despues de consume, el proof se pierde (usuario puede quedar en SelfCheckIn en reintento). Documentar como riesgo UX/audit, no como atomo DB.

---

## 8. Criterio para PASS pleno de atomicidad

1. Suite de fault-injection (F1–F5) verde en PostgreSQL.
2. Asserts DB: cero participantes acreditados / cero `BulkAccreditation` / sin snapshot nuevo cuando se inyecta fallo pre-commit.
3. F6 documentado como degradacion aceptable con alerta/metricas.

Hasta entonces: **implementado en codigo + happy-path evidence; matriz de fallos NO CERTIFIED**.
