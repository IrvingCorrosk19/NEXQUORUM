# UX/Functional Remediation — Phase 0 Inventory

Evidence date: 2026-08-11  
Sources: code + API contracts + VPS runtime (prior sessions) + static page smoke.

## Mental model (target)

```
Platform → PH → Assemblies → Assembly → Live session
```

## Screen inventory (admin / operator)

| Page | Route | Primary role | Objective | CRUD | Key APIs | UX problems (observed) |
|------|-------|--------------|-----------|------|----------|------------------------|
| Login | `/` `index.html` | all | Auth | — | `/api/auth/login` | Demo list OK |
| PH list/home | `/ph.html` | PHAdmin, President | Select/manage PH | C PH | `GET/POST /api/ph` | Was "Onboarding Center"; IA partially fixed |
| PH detail | `/ph.html?phId=` | PHAdmin | Units/owners/config | CRUD U/O | `/api/ph/{id}/*` | Long form; Save at bottom; Eliminar confusing vs archive; raw enums in filters |
| Calendar | `/calendar.html` | operators | Schedule | C/U/Cancel | `/api/calendar/*` | Technical labels in places |
| Comms | `/communications.html` | PHAdmin | SMTP | U/Test | `/api/communications/*` | Technical fields always visible |
| Convocation | `/convocation.html` | operators | Send | C/Send | `/api/convocations/*` | Confirm copy improved |
| Assembly workspace | `/dashboard.html?assemblyId=` | President+ | Overview | — | `/api/assemblies/{id}/dashboard` | IA remodelled; secondary links still dense |
| Check-in | `/checkin.html` | operators | Accreditation | U | attendance APIs | Label "check-in" legacy in code paths |
| Lobby | `/lobby.html` | all | Pre-join | — | room | — |
| Live room | `/assembly.html` | all | Session | — | room-state | Separate shell OK |
| Voting studio | `/voting-studio.html` | operators | Motions | CRUD | motions | Dense |
| Minutes | `/minutes.html` | operators | Acta | U | minutes | page-shell |
| Evidence | `/evidence.html` | auditors | Package | R | evidence | page-shell |
| Owner portal | `/owner.html` | Owner | Participate | R | portal | Separated OK |

## Critical functional findings

### PH delete
- **Root cause (not a missing button):** hard delete blocked when assemblies/votes/recordings/quorum exist (`EvaluatePhDeleteAsync`).
- UI shows **Eliminar…** then redirects to **Desactivar** → users perceive "cannot delete".
- **Policy:** prefer **Archivar (Inactive)** for PHs with history; hard delete only empty drafts.

### Owner delete
- Same pattern: history → must **Desactivar**; hard delete only without assembly footprint.
- `window.confirm` still used for finalize ownership / bulk invite.

### Forms
- PH info: single flat grid; Save only at end → scroll required.
- No sticky action bar / dirty-state guard.

### Language
- Filters still use enum values as option values (OK) but some badges/raw strings leak.
- Access labels partially Spanish via `platformAccessLabel`.

## Remediation priority (this pass)

1. Danger zone: Archivar PH (primary) / Eliminar only if `canHardDelete`
2. Sticky save + dirty state on PH form
3. Form sections for PH info
4. Replace remaining `confirm()` 
5. Owner row actions Ver / Editar / ⋮ with Desactivar language
6. Empty states + Spanish microcopy

## Browser note

No Cursor browser MCP in this environment; E2E uses HTTPS smoke scripts against VPS + code inspection. Full visual browser matrix remains open for certification.
