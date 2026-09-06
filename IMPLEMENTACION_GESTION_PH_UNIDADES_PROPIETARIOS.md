# IMPLEMENTACION — Gestion PH, Unidades y Propietarios

## Backend

- `UnitOwnerLinkDto` enriquecido: identification, phone, status, otherUnitCodesInPh.
- `UnitOwnershipDetailDto` enriquecido: unitType, createdAtUtc, updatedAtUtc.
- `EvaluateUnitDeleteAsync` + `DeleteUnitAsync` + endpoints:
  - `GET /api/ph/{phId}/units/{unitId}/delete-evaluation`
  - `DELETE /api/ph/{phId}/units/{unitId}`
- Auditoria: `UNIT_DELETED`, `UNIT_DEACTIVATED`, `UNIT_REACTIVATED`.
- Guard `UNIT_OWNERSHIP_LOCKED_LIVE_ASSEMBLY` en end/transfer ownership.

## Frontend

- `ph-units-hub.js`: listado, filtros, cards moviles, modal con pestañas Informacion / Propietario / Historial.
- Flujos: crear/editar unidad, crear/vincular/editar/cambiar/desvincular propietario, activar/desactivar/eliminar unidad.
- Menu **Administrar PH** en el hero.
- Banner de coeficientes acumulados.
- CSS dark search, Acciones, skeleton, empty, responsive bottom-sheet modal.

## Archivos tocados

- `src/Asambleas.Contracts/PhOnboarding/PhOnboardingDtos.cs`
- `src/Asambleas.Application/PhOnboarding/PhOnboardingService.cs`
- `src/Asambleas.Web/Controllers/PhOnboardingController.cs`
- `src/Asambleas.Domain/Enums/AuditEventType.cs`
- `wwwroot/ph.html`, `js/modules/ph-app.js`, `js/modules/ph-units-hub.js`, `css/ph.css`