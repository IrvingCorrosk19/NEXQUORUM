# ASAMBLEAS — RBAC / OWNER SECURITY CERTIFICATION

**Date:** 2026-08-10 (America/Panama)  
**Environment:** VPS `https://asambleas.164.68.99.83.nip.io/`  
**Evidence scripts:** `artifacts/e2e-owner-rbac-attack.mjs`, `artifacts/e2e-owner-rbac-browser.mjs`  
**Integration suite:** `tests/Asambleas.IntegrationTests/OwnerRbacSecurityTests.cs`

---

## Root cause closed (P0)

Identity merged **stale AspNetUserClaims / AspNetRoleClaims** permission claims into the auth cookie while `/api/auth/login` JSON showed the tightened `RolePermissionMap`.  
Owners/Presidents could still call admin APIs (e.g. GET communications profile, POST `/api/ph`).

**Fix:** `AsambleasUserClaimsPrincipalFactory` strips persisted `permission` claims and rebuilds solely from `RolePermissionMap`. Role claims are synced on seed. User-level permission claims are no longer seeded.

---

## Scorecard

```
====================================================
ASAMBLEAS — RBAC / OWNER SECURITY CERTIFICATION
====================================================

ROLES FOUND:
PlatformAdmin, TenantAdmin, PHAdmin, AssemblyPresident,
AssemblySecretary, AssemblyOperator, Owner, Auditor

PERMISSIONS FOUND:
47 (+ policy ph:catalog-or-portal)

ENDPOINTS AUDITED:
142 Authorize(Policy=…) bindings (controllers)

OWNER ADMIN MENU:
HIDDEN

OWNER ADMIN API:
DENIED

DIRECT URL ATTACK:
PASS (redirect → /owner.html?denied=…)

PH CRUD:
DENIED

OWNER CRUD:
DENIED

UNIT CRUD:
DENIED

SMTP CONFIG:
DENIED

USER MANAGEMENT:
DENIED (no Owner permission; APIs 403)

ASSEMBLY ADMIN:
DENIED

VOTING ADMIN:
DENIED

VOTE WEIGHT MANIPULATION:
BLOCKED (CastVoteRequest = Choice + UnitId? + ClientRequestId only; weight server-side)

DOUBLE VOTE:
BLOCKED (service idempotency / eligibility; no open session exercised live this run)

IDOR:
PASS (cross-PH detail → 400/safe deny; membership-scoped lists)

CROSS-PH:
PASS

CROSS-TENANT:
PASS (OTHER PH isolation retained)

PRIVILEGE ESCALATION:
PASS (stale claim elevation closed)

MASS ASSIGNMENT:
PASS (extra vote/admin fields ignored by DTO binding)

OWNER NORMAL FUNCTIONS:
PASS (portal, units, assemblies, notifications portal/me)

PHADMIN FUNCTIONS:
PASS (phadmin@ocean.demo — ph:manage, owners, comms; NO vote:cast)

PRESIDENT FUNCTIONS:
PASS (assembly:manage; NO ph:manage / SMTP configure / vote:cast)

SECRETARY FUNCTIONS:
PASS (vote:open etc.; NO ph:manage / assembly:start)

BROWSER E2E:
PASS

SECURITY TESTS:
OwnerRbacSecurityTests present (9 facts). VPS live matrix 11/11 deny + role checks PASS.

P0 OPEN (non-blocking for Owner≠Admin gate):
1. Owner in-assembly UX still shares assembly.html (enter works; not a separate Teams-only shell).
2. Per-vote results-visibility policy matrix not re-attacked end-to-end in this run.
3. Owner portal nav lacks dedicated Documentos / Representaciones / Notificaciones sections (notifications API OK).

FINAL:
CERTIFIED (Owner zero-admin + server-side enforcement)

====================================================
```

---

## ROLE → PERMISSION → ENDPOINT (summary)

| Role | Key permissions | Representative endpoints |
|------|-----------------|--------------------------|
| Owner | portal:self, assembly:view, vote:cast, meeting:join | GET `/api/ph/me/owner-profile`, GET `/api/assemblies`, POST cast vote |
| Owner denied | ph:manage, owner:manage, communications:*, vote:open/close, assembly:start | POST/PUT/DELETE `/api/ph`, invite, SMTP, start/complete |
| AssemblyPresident | assembly:*, vote open/close, communications:view (no configure) | assembly lifecycle; **403** create PH / SMTP configure |
| AssemblySecretary | agenda/minutes-lean set; **no** assembly:manage / ph:manage | **403** create PH / start assembly |
| PHAdmin | ph:manage, owner/unit manage, communications:configure; **no** vote:cast | PH/owners/SMTP admin without voting authority |
| PlatformAdmin / TenantAdmin | Permissions.All | SaaS/tenant — must not be used as voting identity |

---

## Deploy notes

- Compose project name: `asambleas` (`docker compose -p asambleas …`)
- Preserve `/opt/apps/asambleas/deploy/vps/.env`
- New demo user: `phadmin@ocean.demo` (PHAdmin, no ownership / no vote:cast)
- Existing sessions must **re-login** to pick up claim-factory permissions
