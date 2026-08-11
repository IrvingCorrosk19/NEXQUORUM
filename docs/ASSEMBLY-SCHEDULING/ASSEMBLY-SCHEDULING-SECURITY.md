# Assembly scheduling security

- Requires `assembly:schedule` (create/edit) / `assembly:reschedule` / `assembly:cancel` (or manage).
- Tenant match on PH (`TenantGuard.EnsureTenantMatch`).
- Membership required to schedule on a PH unless Platform/Tenant admin.
- Inactive PH blocked.
- Location required for `PRESENCIAL` / `HIBRIDA`.
- Past start rejected server-side.
- `ClientRequestId` + recent duplicate title/start soft-idempotency (~2 min).
- Cross-tenant / unknown PH IDs rejected (no create).
