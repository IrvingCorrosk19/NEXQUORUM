# Unit Management

## Routes

- UI: `/ph.html` → **Unidades**
- API: `/api/ph/{phId}/units`

## Manual

Code, optional tower/block, floor, type, coefficient %, active flag.

## Bulk generation

`POST .../units/bulk-generate` with floor/unit ranges, optional prefix/tower.  
`previewOnly: true` returns codes without write; confirm creates (max 5000).

## Uniqueness

`(PropertyHorizontalId, Code)` unique. Duplicate codes block readiness.
