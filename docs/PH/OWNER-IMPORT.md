# Owner / PH Roster Import

## Flow

Upload multi-sheet XLSX (or CSV) → analyze → preview with classifications → optional patch/exclude rows → commit (all-or-nothing EF transaction) → optional `IMPORT-ERRORS.xlsx`.

## Template

`GET /api/ph/{phId}/import/template` → `padron-{code}.xlsx`

Sheets:

| Sheet | Columns |
|-------|---------|
| **Unidades** | CodigoUnidad, TorreBloque, Piso, TipoUnidad, Coeficiente, Estado |
| **Propietarios** | TipoIdentificacion, NumeroIdentificacion, Nombres, Apellidos, NombreCompletoRazonSocial, Correo, Telefono, Estado |
| **PropietarioUnidad** | NumeroIdentificacion, Correo, CodigoUnidad, PorcentajePropiedad, Estado |
| **Catalogos** | Suggested ID types, unit types, estados |
| **Instrucciones** | Human Spanish guidance (includes PH name) |

Legacy single-sheet / flat CSV (`Unidad` + `Email` style) is still accepted: each row synthesizes one unit + owner + relation (SharePercent=100).

## API

- `POST …/import/analyze` — multipart file → `PhRosterImportPreviewDto`
- `POST …/import/patch-row` — edit a preview row
- `POST …/import/exclude-row` — include/exclude a row
- `POST …/import/commit` — `{ sessionId, mode, confirmUpdate, clientRequestId, confirmPhName? }`
- `GET …/import/{sessionId}/errors` — error workbook

Modes: `CreateOnly` (default; never overwrite) | `CreateAndUpdate` (requires `confirmUpdate=true`; updates unit/owner profile fields only; still creates ownerships, does not change existing SharePercent).

## Limits

Max 5000 rows total across sheets, 5 MB file, 2000 chars/cell. Sessions are in-memory (single instance), ~1 hour.

## Guards

- RBAC `ph:import`
- Live assembly lock: commit blocked if any assembly for the PH is CheckIn / InProgress / Paused
- Coefficient projected ≠ 100 → Warning (does not block commit)
- Audit `PH_ROSTER_BULK_IMPORTED` without full PII (emails masked in error report)
- Does not touch AssemblyRepresentation snapshots or invent Powers/representantes
