# Testing — EO-001

## Executed suites

| Suite | Result |
|-------|--------|
| UnitTests | PASS (28) |
| ArchitectureTests | PASS (3) |
| IntegrationTests | PASS (4) — PostgreSQL real |
| SecurityTests | PASS (8) — CROSS_TENANT_LEAKS = 0 |
| E2ETests automated flow | PASS (2) |
| E2E LiveKit A/V | SKIP / BLOCKED — credentials required |

## Browser UI

Use Cursor browser or manual sessions against `http://localhost:5188` with demo users.

## Notes

- E2E automated tests use `WebApplicationFactory` (real app + PostgreSQL), not Playwright, due to local disk constraints when copying Playwright's Node binary.
- Manual multi-browser UI for 8 concurrent humans remains recommended for projection/operator UX acceptance.
