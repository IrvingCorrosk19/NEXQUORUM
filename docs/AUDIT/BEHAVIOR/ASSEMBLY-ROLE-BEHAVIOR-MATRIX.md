# ASSEMBLY ROLE BEHAVIOR MATRIX

**Audit date:** 2026-08-12  
**Source:** `Roles.cs`, `RolePermissionMap.cs`, `Permissions.cs`, `PhScopedAdminHandler`  
**Method:** Code permissions map + status guards in services (not assumed from old certifications).

---

## Real roles (do not invent)

| Role code | Typical use |
|-----------|-------------|
| `PlatformAdmin` | Platform |
| `TenantAdmin` | Tenant |
| `PHAdmin` | Property horizontal admin |
| `AssemblyPresident` | Preside assembly |
| `AssemblySecretary` | Minutes / secretariat |
| `AssemblyOperator` | Live ops |
| `Owner` | Unit owner participant |
| `Auditor` | Read / evidence / audit |

There is **no** separate “Viewer” role; closest is Owner (limited) or Auditor (read-heavy).

---

## Permission clusters (summary)

| Capability | Platform/Tenant Admin | PHAdmin | President | Secretary | Operator | Owner | Auditor |
|------------|----------------------|---------|-----------|-----------|----------|-------|---------|
| PH / owners / units admin | Y | Y (scoped) | N | N | N | **N** | N |
| Schedule / cancel / reschedule | Y* | Y* | Y* | varies* | N | N | N |
| Start / pause / complete | Y* | Y* | Y* | limited* | Y* | N | N |
| Attendance manage | Y* | Y* | Y* | Y* | Y* | N (view only) | view |
| Vote open/close | Y* | Y* | Y* | Y* | Y* | N | N |
| Vote cast | — | — | — | — | — | **Y** | N |
| Meeting join | Y | Y | Y | Y | Y | **Y** | N† |
| Recording control | Y* | Y* | — | — | — | N | N |
| Recording view | Y | Y | Y | Y | Y | Y | Y |
| Audit view | Y | Y | — | — | — | N | Y |
| Expediente | Y | Y | Y | Y | Y | view | view+download |

\* Exact claims differ per `RolePermissionMap` — President/Secretary/Operator have assembly operational claims; Owner does **not** have `assembly:manage|start|close|schedule`, `vote:open|close`, `attendance:manage`, PH CRUD, SMTP, etc.  
† Auditor has expediente/recording view, not `meeting:join` in map.

### Owner restrictions — verdict

| Must NOT | Status |
|----------|--------|
| Administrar PH / owners / coeficientes | **PASS** (no permissions) |
| Editar asamblea administrativa / SMTP / users | **PASS** |
| Abrir/cerrar votaciones / alterar quórum API | **PASS** (no manage perms; quorum mutate via presence if accredited — edge) |
| Editar acta final | **PASS** (no minutes write API) |
| Entrar / votar / ver resultados según política | **PASS** (has join/cast/view) |

---

## Role × lifecycle actions (operational)

| Action | Owner | President | Secretary | PHAdmin | Notes |
|--------|-------|-----------|-----------|---------|-------|
| Create assembly | DENY | ALLOW* | * | ALLOW* | `assembly:schedule` |
| Start check-in / start | DENY | ALLOW | * | ALLOW | `assembly:start` |
| Complete | DENY | ALLOW | * | ALLOW | `assembly:close` |
| Accredit others | DENY | ALLOW | ALLOW | ALLOW | `attendance:manage` |
| Self check-in | ALLOW† | ALLOW† | ALLOW† | ALLOW† | status-gated |
| Cast vote | ALLOW | * | * | * | status + eligibility |
| Open vote | DENY | ALLOW | ALLOW | ALLOW | assembly must be InProgress |
| Join LiveKit | ALLOW | ALLOW | ALLOW | ALLOW | blocked Draft/Completed/Cancelled |
| View minutes / expediente | ALLOW | ALLOW | ALLOW | ALLOW | read |

† If participant + accredited path / portal rules.

---

## PhScopedAdmin

Local PH membership `RoleHint=PHAdmin` elevates **PH-scoped** permissions (`ph:*`, `owner:*`, `unit:*`, import, templates/comms) via `PhScopedAdminHandler`.  
It does **not** automatically grant assembly lifecycle or voting-admin claims unless those claims exist on the user/role.

---

## Findings

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| BEH-ROLE-001 | P2 | No dedicated Viewer role; product checklist assumed Viewer | N/A / map to Owner/Auditor |
| BEH-ROLE-002 | P1 | Role matrix exists in code but **status** gates are uneven across modules (recording, hub, survey, convocation) — role PASS ≠ lifecycle PASS |
| BEH-ROLE-003 | P0 | Owner with `meeting:join` can SignalR-join Completed assembly → presence/quorum side effects | FAIL |
| BEH-ROLE-004 | — | Owner cannot administer PH / open votes / close assembly | PASS |
