# Ownership history

`Ownership` rows are never cascade-deleted when ending a relationship.

- End → `IsActive=false`, `EffectiveToUtc=now`
- Re-link same Owner+Unit → **reactivate** existing row (unique index preserved)
- Coefficient remains on `Unit`; share on `Ownership`

Supports:

- Multiple units per owner
- Multiple owners (co-ownership shares) per unit
