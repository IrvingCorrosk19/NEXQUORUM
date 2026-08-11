# Assembly rescheduling

## UI

Drawer → **Reagendar** → nueva fecha/hora en hora local del PH + motivo + checkbox de notificación (opt-in).

## API

- `GET /api/assemblies/{id}/reschedule/impact?newScheduledAtUtc=...`
- `POST /api/assemblies/{id}/reschedule` with `reason`, optional `notifyParticipants`.

## Audit

`AssemblyScheduleChange` stores previous/new start/end, reason, actor, timestamp, notification status.

Edits that change datetime via `PUT /api/assemblies/{id}` also append a schedule change with reason `Actualización de programación`.
