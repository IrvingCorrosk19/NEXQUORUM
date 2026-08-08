# EO-006 — Known Limitations

1. Co-ownership fractional SharePercent not applied to coefficient (100% share demo).
2. Power revoke mid-assembly UI/process incomplete.
3. Representation change during assembly not exposed as operator workflow.
4. 8-user browser realtime / human check-in / full WCAG matrix NOT EXECUTED.
5. Existing Development DB must be recreated to pick up absentee owners + powers seed (seed skips if tenants exist).
6. SignalR ≠ legal presence (by design); short disconnect keeps TemporarilyDisconnected in quorum.
7. Client-side participant search only (demo scale).
