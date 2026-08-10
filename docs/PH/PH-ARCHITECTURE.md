# PH Architecture

## Tenancy decision (authoritative)

**Tenant contains many Property Horizontals (PH).**  
PH ≠ Tenant. Do **not** provision a new tenant when creating a PH.

```
Tenant
 └── Organization(s)
      └── PropertyHorizontal (PH)  ← onboarding unit
           ├── Units (optional Tower string)
           ├── Owners (tenant-scoped) ↔ Ownership ↔ Units
           └── UserPropertyMembership (multi-PH users)
```

## Why not PH = Tenant?

Existing assemblies, quorum, voting, communications and calendar already key off `PropertyHorizontalId` inside a tenant. Creating a parallel “PH-as-tenant” model would duplicate isolation, claims and seeds.

## Isolation

- EF tenant query filters on all tenant-scoped entities.
- PH-scoped APIs take `propertyHorizontalId` from the route and verify tenant match server-side.
- Active PH context lives in claim `property_horizontal_id` (never trust client TenantId).
- Switching PH updates the claim via `POST /api/ph/switch` after membership check.

## Coefficient vs ownership share

| Field | Location | Meaning |
|-------|----------|---------|
| `Unit.CoefficientPercent` | Unit | PH voting/quorum weight (master) |
| `Ownership.SharePercent` | Ownership | Share of that unit among co-owners |

Voting/quorum engines must read coefficients from the database — never from the ballot payload.
