# ASAMBLEAS — UX/UI + Functional Remediation Certification

Date: 2026-08-11  
Scope: Stop-the-line remediation (PH forms, archive policy UX, sticky save, owner actions, Spanish labels).  
Full app redesign + matrix E2E **not** complete.

## Phase 0

Inventory: `docs/AUDIT/UX-FUNCTIONAL-REMEDIATION/00-INVENTORY.md`

## Root causes closed this pass

| Report | Finding | Fix |
|--------|---------|-----|
| PH “no se elimina” | Hard delete blocked with history; UI said Eliminar → redirected to Desactivar | **Archivar propiedad** (deactivate) in Danger Zone; hard delete only if `canHardDelete` |
| Save far away | Submit at end of long form | Sticky action bar + dirty state |
| Owner delete confusing | Same history policy | Clear Spanish confirm → Desactivar when blocked; ⋮ menu |
| `window.confirm` | Native dialogs | Replaced finalize/bulk invite with ConfirmDialog |
| Raw status badges | `Active`/`Inactive` | Spanish lifecycle labels |

## Scorecard (honest)

| Item | Result |
|------|--------|
| SCREENS AUDITED | 14 (inventory) |
| SCREENS REDESIGNED | 2 (ph + sticky/danger UX; prior IA dashboard) |
| FORMS AUDITED | PH info (remediated); owner/unit partial |
| MODALS AUDITED | confirm dialogs on PH/owner paths |
| PH CREATE | PASS (existing) |
| PH EDIT | PASS (sections + sticky save) — browser visual QA pending |
| PH DELETE/ARCHIVE | **PASS archive path**; hard delete only empty — policy correct |
| OWNER CREATE | PASS (existing) |
| OWNER EDIT | PARTIAL (inline form; drawer not finished) |
| OWNER DELETE/DEACTIVATE | PASS deactivate path; hard delete when allowed |
| UNIT CRUD | PARTIAL (untouched this pass) |
| ASSEMBLY CRUD | PARTIAL (prior IA) |
| SAVE BUTTON ACCESSIBILITY | PASS (sticky) |
| STICKY ACTIONS | PASS (PH form) |
| UNSAVED CHANGES | PASS (beforeunload + leave confirm) |
| CONFIRM DIALOGS | PARTIAL (native confirm removed on 2 paths) |
| ERROR FEEDBACK | PARTIAL |
| LOADING | PARTIAL (Guardando…) |
| EMPTY STATES | PARTIAL |
| TABLES | PARTIAL (owner ⋮) |
| NAVIGATION | PASS (prior IA) |
| PH / ASSEMBLY / LIVE CONTEXT | PASS / PASS / PASS (prior) |
| ROLE-BASED UI | PARTIAL |
| OWNER RBAC | PASS (prior) |
| GUID VISIBLE | 0 known in PH form (code readonly, not UUID) |
| RAW ENUMS | reduced on PH/owner labels; filters still value=enum |
| FALSE SUCCESS | 0 known in remediados |
| BROKEN CRUD | 0 known for archive/delete policy |
| HTTP 400/500 | not fully retested matrix |
| CONSOLE ERRORS | not fully retested |
| DESKTOP/LAPTOP/TABLET/MOBILE | PARTIAL |
| ACCESSIBILITY | PARTIAL |
| SECURITY REGRESSION | not re-run |
| BROWSER E2E | PARTIAL (API/static smoke) |

## P0 OPEN

1. Owner edit **drawer** with sticky footer  
2. Unit/calendar/comms form remediation  
3. Full browser visual QA matrix by role  
4. Server-side pagination for owners at scale  
5. Mobile nav drawer  

## P1 OPEN

1. Pretty URLs  
2. Distinct president/secretary chrome  
3. Design-system component library beyond primitives  

## FINAL VERDICT

**NOT CERTIFIED**

Reason: remediation of reported PH delete/save/form issues shipped; full-application CRUD/role/browser/visual certification incomplete. Do not treat as product-complete.
