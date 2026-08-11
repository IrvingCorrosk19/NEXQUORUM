# Assembly scheduling UX

Route: `/calendar.html` → **Nueva asamblea**

## Principles

- No GUIDs, UTC ISO labels, or TenantId in the create UI.
- PH selected by human name from memberships (server-scoped list) with optional single-PH lock.
- Date + start time + duration in PH timezone; backend stores UTC.
- Modalidad cards: Virtual (no location), Presencial/Híbrida (location required).
- Lobby under **Opciones avanzadas**.
- Sticky footer: Cancelar / Crear asamblea (or Guardar cambios in edit).
- Success panel with next actions: Ver / Agenda / Convocatoria.
- Edit before start via drawer → **Editar** (`PUT /api/assemblies/{id}`).
- Reagendar and Cancelar asamblea remain separate flows with reason + audit.

## Files

- `wwwroot/calendar.html`
- `wwwroot/js/modules/calendar-app.js`
- `wwwroot/js/modules/schedule-time.js`
- `wwwroot/css/calendar.css`
- `Application/Calendar/CalendarSchedulingService.cs`
