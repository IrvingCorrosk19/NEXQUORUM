# Ownership domain

ASAMBLEAS models PH ownership as:

Owner ↔ Ownership ↔ Unit

- Unit holds PH coefficient (`CoefficientPercent`).
- Ownership holds title share (`SharePercent`) and effective dates.
- Historical rows remain with `IsActive=false` / `EffectiveToUtc`.
- No `Unit.OwnerId` sole FK.

## Key APIs

- `POST /api/ph/{phId}/ownerships`
- `POST /api/ph/{phId}/ownerships/{id}/end`
- `POST /api/ph/{phId}/ownerships/transfer`
- `GET /api/ph/{phId}/units/{unitId}/ownerships`
- `GET /api/ph/{phId}/owners/{ownerId}`

## UI

`/ph.html` → Unidades (detalle + transferencia) · Propietarios (unidades asociadas).
