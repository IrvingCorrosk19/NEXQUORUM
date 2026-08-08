# EO-007 — Agenda

Activate via `POST .../agenda/active` — single `IsActive` + `Assembly.ActiveAgendaItemId`.

Blocked while voting open.

Room-state returns `AgendaListResponse` (`items` + `activeAgendaItemId`).

CRUD create/edit: not in scope (seed agenda sufficient for orchestration).
