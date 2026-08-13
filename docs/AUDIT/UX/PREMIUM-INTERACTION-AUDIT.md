# UX INTERACTION AUDIT — Reload / Feedback Inventory

**Date:** 2026-08-12  
**Rule:** Do not break behavioral certification. Prefer in-place updates for CRUD/ops.

## Summary (before → after remediación)

| Metric | Before | After |
|--------|--------|-------|
| `location.reload()` in app JS | 0 | 0 |
| Native `alert()` | 1 (voting studio survey results) | 0 |
| Native `confirm()` | 0 (custom dialogs) | 0 |
| Toast position | bottom-right, text-only | top-right, title+body+icon+close |
| Button loading text | hidden (transparent) | visible “Guardando…” |
| Top progress | none | discrete bar on mutations/nav |
| API mutation progress | none | automatic via `api()` |

## Inventory (representative)

| Screen | Action | Before | Full reload? | Necessary? | Remediation |
|--------|--------|--------|--------------|------------|-------------|
| PH Owners | Save create/edit | API + list refresh + page alert | No | — | Button loading + premium toast |
| PH Owners | Delete | API + list refresh | No | — | Confirm dialog + toast |
| PH switch | Change PH | `location.href` to ph.html | Navigation | Yes (context switch) | Top progress on nav |
| Check-in | Accredit | API + panel refresh | No | — | Button “Acreditando…” + toast object |
| Voting | Cast | Receipt UI | No | — | Success toast |
| Room | Finalize | API + rehydrate | No | — | typeConfirm FINALIZAR + loading |
| Convocation | Send | API + refresh | No | — | Rich toast + Ver entregas |
| Voting studio | Survey results | `alert()` | No | No | confirmDialog read-only |
| Lobby→Room | Enter | navigation | Yes | Yes | Keep |
| Completed lobby | Open | redirect historical | Yes | Yes (seal UX) | Keep |
| Logout | Exit | navigation | Yes | Yes | Keep |
| Export owners | Download | `location.href` file | Download | Yes | Keep |

## Screens audited

login, dashboard, PH, owners, units, assemblies list, calendar, communications, convocation, readiness, agenda, accreditation, voting, room, documents/expediente, minutes, evidence, historical, configuration (comms SMTP).

## Duplicate requests note

`api()` now supports `dedupeKey` + AbortController. Room/dashboard still hydrate multiple resources by design (assembly + quorum + attendance); not collapsed in this pass to avoid behavioral risk.
