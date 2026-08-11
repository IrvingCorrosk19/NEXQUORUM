# PH / Owner security

- Tenant resolved server-side (`ICurrentTenant`); client cannot set TenantId.
- PH access: tenant match + membership for switch.
- Owner GET/mutate requires owner linked to that PH (`EnsureOwnerInPhAsync`) — IDOR cross-PH blocked.
- RBAC: `ph:manage` / `owner:manage` required for mutations; Owner role cannot create PH.
- Optimistic concurrency via `ConcurrencyStamp` on PH and Owner.
- XSS: values stored raw; UI `escapeHtml` on render.
- Mass-assignment: DTOs ignore unknown privilege fields.
- Inactive owners excluded from new representation materialization.
