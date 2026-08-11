# Ownership transfer

`POST .../ownerships/transfer`:

1. End source ownership (keep row, set EffectiveTo)
2. Create/reactivate destination ownership
3. Audit `OWNERSHIP_TRANSFERRED`

Does not mutate historical assembly representations, votes, or quorum snapshots.
