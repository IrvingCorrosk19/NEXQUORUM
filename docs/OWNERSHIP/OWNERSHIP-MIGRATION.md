# Ownership migration

Model already shipped in EO001/EO011 — N:N `ownerships` table.
No destructive Unit.OwnerId migration required.
This release adds transfer API, share-total validation, and unit ownership detail UI.
Rollback: revert application deploy; no schema drop.
