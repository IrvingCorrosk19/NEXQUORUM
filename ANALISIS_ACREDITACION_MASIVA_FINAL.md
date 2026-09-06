# Analisis final — Acreditacion masiva (OLA FINAL)

| Campo | Valor |
|---|---|
| Fecha | 2026-09-06 |
| Commit baseline | `8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef` |
| Working tree | Contiene cambios **no commiteados** de OLA FINAL (VerifiedJoin, locks, atomicidad, P1) |
| Estado previo (docs remediacion) | `IMPLEMENTED — PARTIAL CERTIFIED` |
| Estado post-OLA FINAL | `IMPLEMENTED — PARTIAL CERTIFIED` (ver `CERTIFICACION_FINAL_ACREDITACION_100.md`) |
| Documentos consolidados | `ANALISIS_ACREDITACION_MASIVA.md`, `IMPLEMENTACION_ACREDITACION_MASIVA.md`, `CERTIFICACION_ACREDITACION_300.md` + evidencia OLA FINAL |

---

## 1. Problema de negocio

La mesa de acreditacion debe:

1. Acreditar decenas/cientos de participantes en una sola operacion HTTP, con quorum correcto y auditoria completa.
2. **No** acreditar por abrir un enlace de correo / redeem / claim (anti-autoacreditacion).
3. Distinguir **seleccionados verificados** vs **ausentes** (force-absent restringido).
4. Permitir cerrar/reabrir mesa sin perder acreditados.
5. Ser idempotente bajo concurrencia (mismo `ClientBatchId`).
6. Mantener atomicidad: negocio + auditoria + snapshot de quorum en la misma transaccion; realtime **despues** del commit.

La remediacion previa resolvio batch N+1, ausentes accidentales y autoacreditacion en redeem. OLA FINAL cierra gaps P0 de **prueba de join verificada en servidor**, **idempotencia concurrente**, **limite transaccional explicito**, **ciclo de vida CheckIn⇄Scheduled**, y entrega P1 operativa (excepciones, padron, paginacion).

---

## 2. Hallazgos previos (consolidados) y remediacion

| Hallazgo | Remediacion previa | Estado OLA FINAL |
|---|---|---|
| Autoacreditacion en redeem/claim | Eliminada; solo enrola | Reforzada con **VerifiedJoin server proof** (P0.1) |
| Flag `sessionStorage` como "metodo" | UX hint | **No confiable**: sin `TryConsume` → audit downgrade a `SelfCheckIn` |
| `AllEligible` incluia `Registered` | Excluye ausentes por defecto | Mantiene; force-absent + frase `ACREDITAR AUSENTES` |
| Batch 300 lento (N+1 SaveChanges) | 1 SaveChanges + claims bulk | + lock exclusivo + re-check batchId (P0.2) |
| Deacreditacion 1x1 | `deaccredit-bulk` | Misma tx/atomicidad (P0.3) |
| Representaciones "borradas" | `IsActive=false` historico | Confirmado en test de reacreditacion |
| Contador "confirmados" ficticio | Eliminado (opcion A) | Sin cambio |
| Operadores 0% en quorum UI | Separacion mesa vs propietarios | Sin cambio (P1 summary) |
| Padron 381% mostrado como quorum legal | Banner CONFIGURACION INVALIDA | + diagnostic API + CSV (P1) |
| Cierre de mesa | Parcial / no formalizado | `CheckIn→Scheduled` + `close-checkin` (P0.4) |
| Concurrencia 2 ops / mismo batch | Constraints DB | `FOR UPDATE` + `pg_advisory_xact_lock` + test concurrente (P0.2) |
| Atomicidad audit/quorum | Implicita | Documentada + orden SaveChanges→WriteMany→Recalculate→Commit (P0.3) |
| Escala 1000 / SQL counts / memoria | No | **No ejecutado / no instrumentado** |
| VPS + UAT movil humano | No | **No** |

---

## 3. OLA FINAL — mapa de gaps P0/P1

### P0.1 VerifiedJoin (server-side proof)

- **Riesgo**: cliente podia pedir `Method=VerifiedJoinLink` solo con `sessionStorage`, sin evidencia de redeem.
- **Diseno**: `IVerifiedJoinProofService` / `VerifiedJoinProofService` con `IMemoryCache`, clave `vjl:{tenant:N}:{assembly:N}:{user:N}`, TTL 2h, `TryConsume` de un solo uso.
- **Emision**: redeem/claim en `AssemblyJoinController` (no acredita).
- **Invalidacion**: logout / login-switch (`AuthController`); revoke de access-link (`AssemblyAccessLinkService`).
- **Consumo**: `AttendanceService.CheckInAsync` — si pide VerifiedJoinLink y falla consume → metodo de auditoria = `SelfCheckIn`.
- **Cliente**: `sessionStorage asambleas.vjl:{assemblyId}` = hint UX; cache bust `join4` / `accredit5`.

### P0.2 Idempotencia concurrente

- `BeginExclusiveAssemblyAttendanceAsync`: transaccion EF + `SELECT ... FOR UPDATE` sobre `assemblies` + `pg_advisory_xact_lock` (solo Npgsql).
- Re-lectura de audit de `ClientBatchId` **despues** del lock.
- Evidencia: `Concurrent_same_batchId_is_idempotent_single_effect` PASS.
- Matriz completa multi-operador / batch cruzados: **no exhaustiva** → gate parcial.

### P0.3 Atomicidad negocio + auditoria + quorum

- Dentro de la misma tx: `SaveChanges` (participantes/reps/records) → `_audit.WriteManyAsync` → `_quorum.RecalculateAndSnapshotAsync` → `Commit`.
- `_realtime.PublishQuorumAsync` **despues** del commit.
- `catch` → `Rollback`.
- Suite de inyeccion de fallos (fallo mid-audit, mid-quorum, etc.): **no automatizada** → gate PARTIAL/FAIL para matriz de fallos completa.

### P0.4 Lifecycle mesa

- `AssemblyLifecycle`: `CheckIn → Scheduled` valido (cierre de mesa).
- `POST .../close-checkin` → `CloseCheckInAsync` (audit `CheckInDeskClosed`).
- Participantes acreditados **retenidos** (solo cambia status de asamblea).
- Reapertura: `start-checkin` (`Scheduled → CheckIn`).
- Unit tests lifecycle: transicion valida + matriz invalida PASS.

### P0.5 Bench

- `Scale_300_selected_bulk_under_5_seconds`: preview < 2s, accredit < 5s vs PostgreSQL — PASS.
- Artefacto: `docs/AUDIT/acreditacion-bench-300.json` (`previewMs: 255`, `accreditMs: 495`, `atUtc: 2026-09-06T17:54:35Z`).
- Scale 1000: **no ejecutado** → FAIL/PENDING.
- Conteos SQL / memoria: **no instrumentados**.

### P1 (operacion / UX)

| Entrega | Evidencia |
|---|---|
| Bandeja excepciones | `GET/POST .../attendance/exceptions`, UI `checkin.html` |
| Padron diagnostic + CSV | `GET .../quorum/padron-diagnostic`, `padron.csv` (+ test integracion) |
| Paginacion servidor | `participants?skip&take&q&status` + `participant-ids` |
| Force-absent RBAC | `ForceAbsentPermissionTests` PASS; presidente bloqueado en integracion PASS |
| Separacion mesa en resumen | Ya en UI remediacion |
| Deploy VPS OLA FINAL | **NO** |
| UAT movil humano | **NO** |
| Regresion Voting/LiveKit completa | **NO** re-ejecutada esta sesion |

---

## 4. Evidencia de pruebas (esta sesion — no inventar PASS)

| Suite / slice | Resultado reportado |
|---|---|
| `BulkAccreditation*` (incl. concurrency) | **9/9 PASS** |
| `SecurityTests` | **17/17 PASS** |
| Unit slice (VerifiedJoin 3 + Lifecycle + ForceAbsent + ...) | **37/37 PASS** |
| `VerifiedJoinProofServiceTests` | **3/3 PASS** |
| Web Release build | **OK** |
| Failure-injection atomicidad | **No automatizado** |
| Scale 1000 | **No ejecutado** |
| VPS deploy + E2E aislado | **No** |
| Human mobile UAT 390x844 | **No** |
| Voting / LiveKit / sala full regression | **No re-run completo** |

---

## 5. Riesgos residuales

1. **VerifiedJoin in-memory**: no sobrevive multi-instancia / restart sin sticky session o store distribuido. En farm VPS multi-node, proof puede perderse o no verse → downgrade a SelfCheckIn (correcto en audit, peor UX de metodo).
2. **Advisory lock keys**: derivados de primeros 8 bytes del GUID; colision teorica entre asambleas (mitigado por `FOR UPDATE` de fila).
3. **Atomicidad sin fault-injection**: rollback documentado en codigo; no hay suite que mate el proceso mid-WriteMany.
4. **Concurrencia parcial**: un escenario mismo batchId; faltan 2 operadores batch distintos, deaccredit||accredit, voting abierta.
5. **Escala 1000 + memoria/SQL**: desconocido en produccion.
6. **VPS / movil / regresion AV**: bloquean certificacion 100/100.

---

## 6. Que falta para 100/100 CERTIFIED — VPS VERIFIED

Ver checklist en `CERTIFICACION_FINAL_ACREDITACION_100.md`. Minimo:

- Deploy VPS de este working tree / commit OLA FINAL + asamblea E2E aislada.
- Bench 1000 (o aceptacion formal de limite 300) + opcional SQL/memory.
- Matriz concurrencia ampliada + fault-injection atomicidad.
- UAT movil humano.
- Regresion Voting + LiveKit/sala al menos smoke post-deploy.

**Veredicto analitico:** implementacion P0/P1 sustancial en codigo y tests locales selectivos; **no** certificacion plena.
