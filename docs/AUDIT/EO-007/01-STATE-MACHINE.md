# EO-007 — Meeting State Machine

Statuses: Draft → Scheduled → CheckIn → InProgress ⇄ Paused → Completed (also Paused→Completed).

Cancelled from Draft|Scheduled|CheckIn.

Server authority via `AssemblyLifecycle` + `AssemblyService.TransitionAsync`.

Audits: ASSEMBLY_STARTED, ASSEMBLY_PAUSED, ASSEMBLY_RESUMED, ASSEMBLY_COMPLETED.
