# Owner CRUD

Owners are **tenant-scoped**. PH association via:

- `Ownership` rows on units of the PH (active or historical)
- `RegisteredPropertyHorizontalId` (first registration PH — supports list before unit assignment)

UI: `/ph.html` → tab **Propietarios**.

| Action | API | UI |
|--------|-----|-----|
| Create | `POST /api/ph/{phId}/owners` | **+ Propietario** |
| Read | `GET .../owners`, `GET .../owners/{id}` | Lista / Ver |
| Update | `PUT .../owners/{id}` | Editar |
| Link unit | `POST .../ownerships` | Crear con unidad / Editar + unidad |
| End link | `POST .../ownerships/{id}/end` | Finalizar |
| Deactivate | `POST .../owners/{id}/deactivate` | Desactivar |
| Reactivate | `POST .../owners/{id}/reactivate` | Reactivar |
| Delete | `DELETE .../owners/{id}` after evaluation | Eliminar… |

Coefficient master source: **`Unit.CoefficientPercent`**. Ownership `SharePercent` is co-ownership share of that unit.
