# Multi-PH User Model

`UserPropertyMembership` links `UserId` ↔ `PropertyHorizontalId` within a tenant.

- One identity, many PHs
- Switcher: `GET /api/ph/memberships/mine` + `POST /api/ph/switch`
- Switch re-issues auth cookie with updated `property_horizontal_id` claim
- Target: zero leakage — assemblies/owners/docs filtered by active PH + tenant
