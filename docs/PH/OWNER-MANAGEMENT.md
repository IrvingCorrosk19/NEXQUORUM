# Owner Management

## Routes

- UI: `/ph.html` → tab **Propietarios**
- API: `/api/ph/{phId}/owners`

## Manual create

1. Nombre / Apellido / Tipo ID / Identificación / Email / Teléfono  
2. Optional unit association + share (default 100)  
3. Save → ownership row if unit selected  

## Search & filters

Search: name, identification, unit code, email (tenant-isolated).  
Filters: tower, status, has email, invited, has user.

## Bulk actions

- Export CSV (`GET .../owners/export`) — formula-injection guarded  
- Validate (`POST .../owners/validate-bulk`)  
- Invite selected (`POST .../owners/invite-bulk`) with confirm  

## Invitation

`POST .../owners/{id}/invite` → token hashed, 48h, single-use → `/activate.html?token=...`  
Existing email → link membership, no duplicate user.
