# PH Provisioning

## Who can create a PH?

| Role | Can create PH? |
|------|----------------|
| PlatformAdmin / TenantAdmin | Yes (`ph:manage`) |
| AssemblyPresident / PHAdmin | Yes (`ph:manage`) |
| Owner | No |

Server-side: `[Authorize(Policy = Permissions.PhManage)]` on `POST /api/ph`.

## Transactional create

`PhOnboardingService.CreatePhAsync` in one unit of work:

1. Validate name/code/timezone (tenant-scoped unique code)
2. Attach to existing organization (or first org of tenant)
3. Insert `PropertyHorizontal` (`Draft`, step 1)
4. Insert `UserPropertyMembership` for acting user (`PHAdmin` hint)
5. Audit `PHCreated`
6. `SaveChangesAsync`

On failure, EF rolls back — no half-PH rows.

## Defaults (no demo data in production)

Created fields only: identity, address, timezone, admin contact, lifecycle.  
Demo Ocean seed runs only when `Demo:SeedUsers` / Development allows it.

## First admin

The creator receives an active `UserPropertyMembership`. Additional admins are invited owners or role assignments — never passwords in URLs.
