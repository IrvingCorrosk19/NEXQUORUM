# Owner Import

## Flow

Upload CSV/XLSX → analyze → map columns → validate → preview → commit (all-or-nothing) → optional `IMPORT-ERRORS.xlsx`

## Template

`GET /api/ph/{phId}/import/template` → `ASAMBLEAS-import-template.xlsx`

Columns (synonyms accepted): Unidad, Torre, Piso, Coeficiente, Nombre, Apellido, Identificacion, Email, Telefono

## Limits

Max 5000 rows/session. Sessions are in-memory (single instance).

## Security

- RBAC `ph:import`
- No TenantId from client
- Formula injection escaped on export; import validates types/ranges
- Duplicate detection by identification/email + soft name warnings (no auto-merge)
