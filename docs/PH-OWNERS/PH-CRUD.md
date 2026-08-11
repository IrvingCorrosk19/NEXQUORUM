# PH CRUD

## Model

**Tenant → Organization → PropertyHorizontal (PH).** PH is not the tenant. Many PHs per tenant.

UI: `/ph.html` — Onboarding Center.

## Operations

| Action | API | UI |
|--------|-----|-----|
| Create | `POST /api/ph` | **+ Crear PH** |
| Read list/detail | `GET /api/ph`, `GET /api/ph/{id}` | Cards / Ver |
| Update | `PUT /api/ph/{id}` | Tab Información → Guardar |
| Deactivate | `POST /api/ph/{id}/deactivate` | Desactivar |
| Reactivate | `POST /api/ph/{id}/reactivate` | Reactivar |
| Delete (safe) | `DELETE /api/ph/{id}` after `GET .../delete-evaluation` | Eliminar… |

## Rules

- Code unique per tenant; name change does **not** change `TenantId`, `OrganizationId`, or `Code`.
- Inactive PH blocks new units/owners/assemblies until reactivated.
- Hard delete only when evaluation reports no assemblies/votes/recordings/quorum history.
- Permissions: `ph:view`, `ph:manage`.
