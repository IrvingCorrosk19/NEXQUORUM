# Implementacion — remediacion final acreditacion

## Autoacreditacion

- `AssemblyJoinController` redeem/claim: **no** llama acreditacion.
- `join-app.js` guarda `sessionStorage.asambleas.verifiedJoinLink=1`.
- `POST .../attendance/check-in` con `Method=VerifiedJoinLink|SelfCheckIn` (accion explicita).

## Ausentes

- Permiso nuevo: `attendance:force-absent` (solo PlatformAdmin/TenantAdmin via Permissions.All).
- `BulkAccreditRequest.IncludeAbsentInvitees` + frase + motivo.
- Presidente/mesa: solo seleccion verificada.

## Batch optimizado (`AttendanceService.Bulk.cs`)

- `ResolveEligibleClaimsBulkAsync` (ownerships+powers en 2 queries).
- Participants tracked en un load.
- Representaciones + AttendanceRecords en memoria.
- 1x `SaveChanges`, 1x `WriteManyAsync` auditoria, 1x `RecalculateAndSnapshotAsync`.
- Idempotencia `ClientBatchId` via CorrelationId en auditoria.

## Deacreditacion batch

- `POST .../deaccredit-bulk` y `/preview`
- Motivo obligatorio; bloqueo votacion abierta; no borra ownership/power.

## UX

- Tabla + toolbar sticky; primario = seleccionados.
- Resumen: convocados / acreditados / unidades / coeficiente / presentes / mesa.
- Quorum invalido: banner CONFIGURACION DE COEFICIENTES INVALIDA.

## Endpoints

| POST | Ruta |
|---|---|
| | `/attendance/accredit-bulk` |
| | `/attendance/accredit-bulk/preview` |
| | `/attendance/deaccredit-bulk` |
| | `/attendance/deaccredit-bulk/preview` |
| | `/assemblies/{id}/close-checkin` |

## Rendimiento (local, BulkAccreditationTests)

- Preview 300: < 2s (assert)
- Accredit 300: < 5s (assert) — suite 6 tests ~21s total
- Antes: ~20–25s solo el batch (N+1 + SaveChanges por usuario)