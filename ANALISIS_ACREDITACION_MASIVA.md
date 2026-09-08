# Analisis — Acreditacion exclusiva administrativa

Fecha: 2026-09-07  
Estado: IMPLEMENTED — NO CERTIFICADO (ver `CERTIFICACION_ACREDITACION_ADMIN_ONLY.md`)

## Cambio de politica

La acreditacion es **solo administrativa**. El propietario no se autoacredita, no solicita acreditacion ni completa formularios de mesa.

`POST .../attendance/check-in` ahora exige `attendance:manage`.  
`POST .../attendance/presence` marca presencia si ya esta acreditado (sin acreditar).

Acreditar **no** pone `CheckedIn` ni suma al quorum; la presencia efectiva (JoinAssembly / presence) si.

## Evento tiempo real

`accreditationChanged` — mensaje claro al propietario al aprobar o revocar.
