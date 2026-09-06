# Matriz de escala — Acreditacion 300 / 1000

| Campo | Valor |
|---|---|
| Fecha | 2026-09-06 |
| Baseline commit | `8e5c74f23d54a8f3c4be2f6ae146dfaece9546ef` |
| Ambiente bench | IntegrationTests + PostgreSQL (fixture local) |
| Artefacto 300 | `docs/AUDIT/acreditacion-bench-300.json` |
| Test | `BulkAccreditationTests.Scale_300_selected_bulk_under_5_seconds` |

---

## 1. Objetivos de rendimiento

| Escala | Preview | Accredit bulk | Estado |
|---|---|---|---|
| 300 seleccionados | < 2s | < 5s | **PASS** (assert + artefacto) |
| 1000 seleccionados | TBD (objetivo tentativo < 4s / < 15s o documentar limite) | TBD | **FAIL / PENDING** — no ejecutado esta sesion |

---

## 2. Resultado Scale 300 (evidencia)

Contenido de `docs/AUDIT/acreditacion-bench-300.json`:

```json
{
  "operation": "accredit-bulk",
  "records": 300,
  "previewMs": 255,
  "accreditMs": 495,
  "seedMs": 268,
  "saveChanges": 1,
  "provider": "PostgreSQL",
  "atUtc": "2026-09-06T17:54:35.0939546+00:00"
}
```

| Metrica | Medido | Umbral | Gate |
|---|---|---|---|
| previewMs | 255 | < 2000 | **PASS** |
| accreditMs | 495 | < 5000 | **PASS** |
| seedMs | 268 | < 60000 | PASS (setup) |
| saveChanges negocio | 1 | 1 | PASS (diseno test) |
| Provider | PostgreSQL | PostgreSQL | PASS |

Comparacion remediacion previa: batch N+1 ~20–25s solo accredit → ahora sub-segundo en este run.

---

## 3. Procedimiento del bench 300 (codigo)

1. `ResetDatabaseAsync`.
2. Seed sintetico: 300 units + owners + ownerships + `AssemblyParticipants` (`Registered`) sobre asamblea Ocean demo; units previas desactivadas; coeficientes ~100%/300.
3. `start-checkin`.
4. Cronometrar `POST .../accredit-bulk/preview` con `UserIds` = 300.
5. Cronometrar `POST .../accredit-bulk` `Method=OperatorBulkSelected`.
6. Assert `Requested=Succeeded=300`, `CoefficientAfter ≈ 100`.
7. Best-effort write JSON a `docs/AUDIT/acreditacion-bench-300.json`.

**Nota:** el JSON solo se escribe si el path relativo desde `AppContext.BaseDirectory` resuelve; en este workspace el artefacto **existe** con los ms anteriores.

---

## 4. Scale 1000

| Item | Estado |
|---|---|
| Test automatizado Scale_1000 | **No existe / no ejecutado** |
| Artefacto `acreditacion-bench-1000.json` | **Ausente** |
| Gate rendimiento 1000 | **FAIL / PENDING** |
| Decision de producto | Pendiente: (a) implementar y pasar bench, o (b) certificar limite operativo 300 documentado |

No se inventa PASS ni ms estimados.

---

## 5. Instrumentacion ausente (registrar en matriz)

| Instrumento | Estado | Impacto en certificacion |
|---|---|---|
| Conteo de queries SQL (EF `LogTo` / MiniProfiler / `pg_stat_statements`) por request bulk | **No instrumentado** | No se puede demostrar N+1 residual bajo carga |
| Working set / GC / allocations durante 300/1000 | **No instrumentado** | Riesgo memoria desconocido en VPS |
| Latencia p50/p95 multi-run | Un solo run en assert | Varianza no caracterizada |
| Bench en VPS produccion-like | **No** | Gate VPS FAIL |

---

## 6. Matriz funcional x escala (cobertura tests)

| Escenario | N~1–pocos | N=300 | N=1000 |
|---|---|---|---|
| Preview selected | PASS (suite) | PASS (Scale_300) | PENDING |
| Accredit selected | PASS | PASS | PENDING |
| Idempotencia ClientBatchId (secuencial) | PASS | no dedicado | PENDING |
| Idempotencia ClientBatchId (concurrente) | PASS (1 user) | no | PENDING |
| Deaccredit + reaccredit powers | PASS (demo seed) | no | PENDING |
| Force-absent denied presidente | PASS | n/a | n/a |
| AllEligible sin ausentes | PASS | n/a | n/a |
| Close desk CheckIn→Scheduled | PASS | n/a | n/a |
| Padron CSV/diagnostic | PASS | n/a | n/a |
| Participants page skip/take | PASS | n/a | PENDING stress |

---

## 7. Criterios de cierre de gate escala

Para marcar Scale 300 = PASS (ya): assert verde + artefacto o log con ms + provider PostgreSQL.

Para marcar Scale 1000 = PASS (faltante):

1. Test `Scale_1000_...` o bench manual scripted con mismos asserts de negocio.
2. Artefacto JSON con preview/accredit ms.
3. Documentar umbrales aceptados.
4. Ideal: query count / memory notes.

**Gate escala global hoy:** **PARTIAL** (300 PASS, 1000 FAIL/PENDING, instrumentacion SQL/memoria ausente).
