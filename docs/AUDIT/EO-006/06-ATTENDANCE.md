# EO-006 — Attendance / Presence

Check-in methods extensible via `Method` string (SelfCheckIn / OperatorCheckIn).

Hub `JoinAssembly` → Present **only if already accredited**; otherwise technical join does not create legal presence or quorum contribution.

TemporarilyDisconnected still contributes if accredited (grace — no auto-drop of legal presence).
