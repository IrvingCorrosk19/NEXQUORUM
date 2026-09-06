# Evidencia — Concurrencia e idempotencia (acreditacion masiva)

| Campo | Valor |
|---|---|
| Fecha | 2026-09-06 |
| Baseline | `8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef` + OLA FINAL uncommitted |
| Codigo | `AttendanceService.Bulk.cs` → `BeginExclusiveAssemblyAttendanceAsync` |
| Test primario | `BulkAccreditationConcurrencyTests.Concurrent_same_batchId_is_idempotent_single_effect` |

---

## 1. Amenaza

Dos operadores (o el mismo cliente con retry) envian `POST .../accredit-bulk` con el **mismo** `ClientBatchId` en paralelo.

Sin serializacion:

- Ventana entre "buscar audit previo" y "escribir audit" → doble efecto (doble acreditacion / quorum incorrecto / eventos duplicados).
- Race en claims de unidad (`AssemblyRepresentations`) → unique violation o double-holder.

---

## 2. Mecanismo implementado

### 2.1 Transaccion exclusiva por asamblea

`BeginExclusiveAssemblyAttendanceAsync(assemblyId)`:

1. `Database.BeginTransactionAsync`.
2. Si provider contiene `Npgsql`:
   - `SELECT 1 FROM assemblies WHERE "Id" = {assemblyId} FOR UPDATE` — lock de fila de asamblea.
   - `SELECT pg_advisory_xact_lock(k1, k2)` — lock advisory de transaccion; `k1`/`k2` = `BitConverter.ToInt32` sobre bytes 0–3 y 4–7 del `assemblyId`.
3. Providers in-memory / no-Npgsql: solo BEGIN (tests no-PG no obtienen advisory; integracion usa PostgreSQL).

Comentario en codigo: serializa mutaciones de acreditacion; SaveChanges + WriteMany + quorum snapshot **comparten** esta transaccion.

### 2.2 Re-check idempotencia despues del lock

```text
batchId = ClientBatchId ?? NewGuid()
tx = BeginExclusive...
if ClientBatchId:
  prior = FindBulkAuditReplayAsync(assemblyId, clientBatch, BulkAccreditation)
  if prior: Commit; return prior
... trabajo ...
```

Cierra la ventana TOCTOU: el segundo concurrente espera el lock; al entrar ve el audit del primero y hace replay.

### 2.3 Constraints / manejo de conflicto

- `catch (DbUpdateException)` cuando unique violation → Rollback + `DomainException` representation conflict.
- Deaccredit bulk usa el mismo `BeginExclusive...`.

---

## 3. Evidencia automatizada PASS

### Test: `Concurrent_same_batchId_is_idempotent_single_effect`

Pasos:

1. Reset DB; login `president@ocean.demo`; `start-checkin`.
2. `batchId = Guid.NewGuid()`.
3. Body: `UserIds=[UserOwner101Id]`, `Method=OperatorBulkSelected`, `ClientBatchId=batchId`.
4. `Task.WhenAll` de dos `POST .../accredit-bulk` con el mismo body.
5. Ambos HTTP success; ambos `BatchId == batchId`.
6. Lista participants: exactamente **1** fila con ese `UserId` y `IsAccredited`.

**Resultado sesion:** PASS (incluido en BulkAccreditation* **9/9**).

### Test secuencial relacionado

`Selected_verified_bulk_accredits_without_force_absent_permission` reenvia el mismo `ClientBatchId` tras exito → success (replay path).

---

## 4. Matriz de concurrencia — cobertura real vs deseada

| # | Escenario | Automatizado | Resultado |
|---|---|---|---|
| C1 | Mismo operador, mismo ClientBatchId, 2 POST paralelos, 1 user | Si | **PASS** |
| C2 | Mismo ClientBatchId, N=300 paralelo | No | **PENDING** |
| C3 | Dos operadores distintos, mismo ClientBatchId | No (test usa un client) | **PENDING** |
| C4 | Dos operadores, ClientBatchId distintos, overlapping UserIds | No | **PENDING** |
| C5 | Accredit ∥ Deaccredit mismo user | No | **PENDING** |
| C6 | Accredit ∥ Close-checkin | No | **PENDING** |
| C7 | Accredit ausentes con votacion abierta | Parcial (regla de dominio; no stress concurrente) | **PARTIAL** |
| C8 | Check-in self ∥ operator accredit mismo user | No | **PENDING** |
| C9 | Multi-instance app (dos procesos, un PG) advisory lock | No en CI esta sesion | **PENDING** |
| C10 | Unique violation representation bajo carrera | Codigo catch; test dedicado no listado | **PARTIAL / code-only** |

**Gate concurrencia global:** **PARTIAL** — evidencia solida en C1; matriz 2-operadores exhaustiva **no** certificada.

---

## 5. Limitaciones tecnicas a monitorear

1. **Advisory key derivation:** dos Guid distintos pueden colisionar en (k1,k2) teoricamente; el `FOR UPDATE` de fila mitiga cross-assembly interference en la practica.
2. **Lock solo Npgsql:** otros providers no serializan igual (no es el path de produccion VPS).
3. **Replay response:** debe ser semanticamente equivalente al primer efecto; depende de `FindBulkAuditReplayAsync` + metadata audit.
4. **Realtime post-commit:** dos callers pueden publicar quorum dos veces tras replay/commit corto — idempotente en UI si snapshot estable; no evaluado formalmente.

---

## 6. Como reproducir

```text
dotnet test tests/Asambleas.IntegrationTests --filter FullyQualifiedName~Concurrent_same_batchId_is_idempotent_single_effect
```

Requiere fixture PostgreSQL del collection `AsambleasCollection`.

---

## 7. Criterio para subir a PASS pleno

- C1–C5 automatizados verdes en PG.
- Al menos un run documentado C9 (dos instancias) o justificacion single-instance VPS.
- Sin inventar PASS: hasta entonces gate = **PARTIAL**.
