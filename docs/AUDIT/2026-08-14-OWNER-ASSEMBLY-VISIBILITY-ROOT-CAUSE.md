# OWNER ASSEMBLY VISIBILITY — ROOT CAUSE INVESTIGATION

**Date:** 2026-08-14  
**Environment:** localhost (`https://localhost:7188`)  
**PH:** PH DEMO OCEAN TOWER  
**Owner under test:** irving corro (`irvingcorrosk19@gmail.com`)  
**Investigation mode:** READ-ONLY — no code, query, or data modifications

---

## 1. Scenario reproduced

| Observation | Result | Evidence |
|-------------|--------|----------|
| Admin sees assembly in PH → Asambleas | **YES** | Browser Tab: `ph.html?phId=33333333-3333-3333-3333-333333333301#assemblies`, filter **En curso** shows 2 live assemblies including `14 ago, 7:00 p.m. · VIRTUAL · Convocados 1` and `10 ago... Convocados 9` with **Entrar a sala** |
| Owner sees assembly in Portal → Mis asambleas | **NO** | User report + DB/API trace (see below) |
| Irving can authenticate to portal | **YES (user report)** / **Not re-tested in this session** | Demo passwords return 401 for Irving; user-reported successful login used for UI symptom |
| Backend would return assembly to Irving | **NO** | Zero `assembly_participants` rows for Irving's `UserId` on target assembly |

**Proxy confirmation:** `owner101@ocean.demo` is also a **convocation recipient** for assembly `2186e056-...` but has **no participant row** for that assembly. Authenticated API call returns **0** calendar events containing that assembly — same scoping failure as Irving.

---

## 2. Assembly selected

| Field | Value |
|-------|-------|
| **AssemblyId** | `2186e056-7800-4d93-9338-8cb3ce33c103` |
| **AssemblyName** | `ABLEAAAAAAAAAAA` |
| **PHId** | `33333333-3333-3333-3333-333333333301` |
| **PHName** | PH DEMO OCEAN TOWER |
| **Status** | `CheckIn` (UI: ACREDITACIÓN ABIERTA) |
| **StartDate** | `2026-08-15T00:00:00.000Z` (UI: 14 ago 7:00 p.m. America/Panama) |
| **Modality** | `VIRTUAL` |
| **CreatedAt** | `2026-08-13T23:23:14.419Z` |
| **TenantId** | `11111111-1111-1111-1111-111111111101` |

**Secondary assembly visible in admin (not convoked to Irving):**

| Field | Value |
|-------|-------|
| **AssemblyId** | `44444444-4444-4444-4444-444444444401` |
| **Title** | ASAMBLEA GENERAL ORDINARIA — PH OCEAN TOWER |
| **Status** | `InProgress` |
| **Convocation to Irving** | NO |

---

## 3. Owner selected

| Field | Value |
|-------|-------|
| **OwnerId** | `82d85b69-d18a-4e29-8101-73a18e29635a` |
| **UserId** | `3100cce3-871b-4574-baf8-9409f8e46720` |
| **OwnerName** | irving corro |
| **Email** | irvingcorrosk19@gmail.com |
| **Phone** | 65140986 |
| **PHId** | `33333333-3333-3333-3333-333333333301` |
| **UnitId** | `55555555-5555-5555-5555-555555555101` (Unit 101) |
| **TenantId** | `11111111-1111-1111-1111-111111111101` |
| **Owner status** | Active |
| **Ownership** | Active, 100% share on Unit 101 |
| **PH membership** | Active, RoleHint Owner |

**Duplicate check:** Single `users` row and single `owners` row for `irvingcorrosk19@gmail.com`. No soft-delete flags. No conflicting OwnerId/UserId for this email.

---

## 4. Browser evidence

### Admin (authenticated as phadmin via existing session)

- URL: `https://localhost:7188/ph.html?phId=33333333-3333-3333-3333-333333333301#assemblies`
- Filter **En curso** shows live assemblies with **Entrar a sala**
- Sidebar lists upcoming assembly on **08/13/2026, 7:00 p.m.** (matches `ABLEAAAAAAAAAAA` scheduled date in PH timezone)

### Owner portal (Irving)

- User-reported: `owner.html#assemblies` shows **"Aún no tienes asambleas próximas"**
- Irving login with seeded/demo passwords failed (401) — password set at account activation
- **Control case:** `owner101@ocean.demo` logged in via API; would see Ordinaria (`44444444...`) via participant seed, but **not** `ABLEAAAAAAAAAAA` despite being convocation recipient

---

## 5. Admin endpoint

| Item | Value |
|------|-------|
| **Route** | `GET /api/calendar/events?from=...&to=...` |
| **Controller** | `CalendarController.Events` → `CalendarSchedulingService.ListEventsAsync` |
| **Scope** | `ScopedAssembliesQuery(userId, canManage=true)` → **all assemblies in tenant** when user has `assembly:manage` |
| **Status filter (admin UI)** | Client-side tabs; API returns full scoped set |

**Live API (phadmin@ocean.demo, 2025-06-01 → 2027-01-01):**

```json
{
  "calendarEventsCount": 12,
  "assembly2186Present": true,
  "assembly2186Status": "CheckIn",
  "assembly2186Title": "ABLEAAAAAAAAAAA"
}
```

---

## 6. Owner endpoint

| Item | Value |
|------|-------|
| **Primary route** | `GET /api/calendar/events?from={-2mo}&to={+6mo}` |
| **Fallback route** | `GET /api/assemblies` |
| **Next card route** | `GET /api/calendar/next` |
| **Frontend** | `owner-portal-app.js` → `#assemblies` via hash router |
| **Controller** | `CalendarController` / `AssembliesController` |
| **Service** | `CalendarSchedulingService.ListEventsAsync` / `AssemblyService.ListForCurrentUserAsync` |
| **Scope** | **Only assemblies where `assembly_participants.UserId = currentUserId`** |

**Live API comparison:**

| User | calendar/events count | assembly 2186 in response | assemblies list count |
|------|----------------------|---------------------------|----------------------|
| phadmin@ocean.demo | 12 | **YES** (CheckIn) | 3 (different endpoint scope) |
| owner101@ocean.demo | 1 | **NO** | 1 (only `44444444...` seed participant) |
| irvingcorrosk19@gmail.com | N/A (401 with demo pwd) | **NO** (0 participant rows → empty) | **NO** |

**Expected Irving response (derived from query + DB):**

```json
{
  "events": []
}
```

Frontend empty state is rendered when `state.events.length === 0` — not a rendering bug.

---

## 7. DB relationships (assembly `2186e056-...`)

### Assembly

| Id | PHId | Status | ScheduledAtUtc |
|----|------|--------|----------------|
| 2186e056-7800-4d93-9338-8cb3ce33c103 | 33333333-3333-3333-3333-333333333301 | CheckIn | 2026-08-15T00:00:00Z |

### Convocation

| Field | Value |
|-------|-------|
| Convocation exists | **YES** |
| ConvocationId | `5bfa70f0-1a54-4498-b93a-be50c0abb892` |
| AssemblyId | `2186e056-7800-4d93-9338-8cb3ce33c103` |
| PHId | `33333333-3333-3333-3333-333333333301` |
| Status | `Sent` |
| SentAt | `2026-08-13T23:28:35.084Z` |

### Recipient (Irving)

| Field | Value |
|-------|-------|
| Recipient exists | **YES** |
| RecipientId | `1450260e-d6b9-4dda-a38b-cf2f580c9c0e` |
| OwnerId | `82d85b69-d18a-4e29-8101-73a18e29635a` ✓ matches Irving |
| UserId | `3100cce3-871b-4574-baf8-9409f8e46720` ✓ matches Irving |
| Email | irvingcorrosk19@gmail.com |
| IsValid | true |
| Delivery | Email channel queued/sent via batch |

**Total recipients for this convocation:** 9 (including Irving and demo owners 101–106)

### AssemblyParticipant (Irving)

| Field | Value |
|-------|-------|
| Row exists for Irving UserId + AssemblyId | **NO** |
| Rows for assembly 2186 | **1** — only president (`77777777-7777-7777-7777-777777777101`), `IsAccredited=true` |

### Accreditation / Attendance (Irving)

| Field | Value |
|-------|-------|
| Accreditation exists | **NO** |
| attendance_records for Irving + assembly | **0 rows** |
| assembly_participants.IsAccredited for Irving | N/A (no participant row) |

**Important correction to user-reported "acreditado":** DB shows Irving was **not** accredited on this assembly. Only the assembly president was accredited. Accreditation **requires** an existing `assembly_participants` row (`AttendanceService.AccreditInternalAsync` throws *"El participante no está inscrito en esta asamblea."* if missing).

### PH / Unit alignment

All entities share `TenantId = 11111111-1111-1111-1111-111111111101` and `PHId = 33333333-3333-3333-3333-333333333301`. **PASS** — not a tenant/PH isolation bug.

### Soft delete / inactive flags

No `IsDeleted` on assembly, convocation, recipient, or owner. Owner and ownership are active. **PASS**

---

## 8. Authentication identity (owner portal)

After login, backend resolves:

- **UserId** from session/JWT (`ICurrentTenant`)
- **Owner profile** via `/api/ph/me/owner-profile` (separate from assembly scoping)
- **Assembly list** uses **`UserId` only** via `assembly_participants` — **not** `OwnerId`, **not** `convocation_recipients`

Irving's UserId resolves correctly in DB and matches convocation recipient. Identity resolution is **not** the break point.

---

## 9. Owner query filters (actual code)

### Calendar (`ListEventsAsync`)

```csharp
// Owners (no assembly:manage):
var ids = _db.AssemblyParticipants
    .Where(p => p.UserId == userId)
    .Select(p => p.AssemblyId);
return _db.Assemblies.Where(a => ids.Contains(a.Id));

// Then:
.Where(a => a.ScheduledAtUtc >= rangeStart && a.ScheduledAtUtc <= rangeEnd)
// Post-filter overlap window
```

### Assemblies list (`ListForCurrentUserAsync`)

```csharp
var participantAssemblyIds = await _db.AssemblyParticipants
    .Where(p => p.UserId == userId)
    .Select(p => p.AssemblyId);
var assemblies = await _db.Assemblies
    .Where(a => participantAssemblyIds.Contains(a.Id));
```

**Not used in owner scope:** ConvocationRecipient, OwnerId, UnitId, accreditation status, invitation status.

---

## 10. Status mapping analysis

**Hypothesis rejected:** Owner portal does **not** exclude `CheckIn` or `InProgress`.

Frontend (`owner-portal-app.js`) explicitly includes:

```javascript
["InProgress", "Paused", "CheckIn"].includes(String(e.status))
```

`GetNextAsync` also includes `CheckIn`, `InProgress`, `Paused` in its query.

**Failure occurs earlier:** assembly never enters the participant-scoped set.

---

## 11. Date/time analysis

| Field | Value |
|-------|-------|
| Assembly ScheduledAtUtc | 2026-08-15T00:00:00Z |
| Investigation date | 2026-08-14 (local) |
| Owner portal window | ~2 months back → 6 months forward |
| Assembly in window? | **YES** |

**Hypothesis rejected:** Date/timezone filtering is not excluding this assembly. It is excluded because it is not in the participant ID set at all.

---

## 12. Invitation / convocation status

| Field | Value |
|-------|-------|
| Convocation status | Sent |
| Recipient IsValid | true |
| Portal requires InvitationStatus=Accepted? | **NO** — convocation data is not queried for owner assembly list |

**Hypothesis rejected:** Invitation state mismatch is irrelevant to current owner list implementation.

---

## 13. Accreditation filter

Portal does **not** require accreditation to list assemblies. However, accreditation **cannot exist** without a participant row. Irving has neither.

---

## 14. Admin vs Owner query comparison

| Criterion | Admin (phadmin) | Owner (Irving / owner101) |
|-----------|-----------------|---------------------------|
| PH scope | All tenant assemblies (manage permission) | Only participant assemblies |
| Owner link | Not used | Not used |
| User link | Not used for scope | **assembly_participants.UserId** |
| Recipient link | Not used | Not used |
| Accreditation link | Not used | Not used |
| Status filter | Optional query param; UI tabs client-side | No status exclusion for CheckIn/InProgress |
| Date filter | Range query | Range query (would include Aug 15) |
| Active/Deleted | Standard EF entities | Same |
| Convocation | Irrelevant to list | Irrelevant to list |

**Divergence point:** Admin lists by PH/tenant; Owner lists by **`assembly_participants` enrollment only**.

---

## 15. Frontend render analysis

| Check | Result |
|-------|--------|
| Backend returns `[]` for Irving-equivalent user | **YES** (owner101 proxy for same assembly) |
| Frontend filters out CheckIn | **NO** — would show if present |
| Empty state message | Correct given empty API |
| Bug layer | **BACKEND / DOMAIN DATA RELATIONSHIP** — not frontend |

---

## 16. Traceability matrix

| Entidad | Existe | ID | Relación correcta | Observación |
|---------|--------|-----|-------------------|-------------|
| Assembly | YES | 2186e056-... | PASS | Visible in admin |
| PH | YES | 33333333-... | PASS | All entities aligned |
| Owner | YES | 82d85b69-... | PASS | Active, single record |
| Unit | YES | 55555555-...101 | PASS | Ownership 100% active |
| Convocation | YES | 5bfa70f0-... | PASS | Status Sent |
| Recipient | YES | 1450260e-... | PASS | OwnerId/UserId match Irving |
| Accreditation | NO | — | **FAIL** | No participant → no accreditation possible |
| User | YES | 3100cce3-... | PASS | Matches recipient |
| **AssemblyParticipant** | **NO (Irving)** | — | **FAIL** | **Chain break — root cause** |

---

## 17. Root cause

### Where the chain breaks

```text
Assembly ──YES──► Convocation ──YES──► ConvocationRecipient (Irving) ──YES──►
  ✗ MISSING LINK ✗  AssemblyParticipant (Irving UserId)
      ──NO──► Accreditation
      ──NO──► Owner Portal query (assembly_participants scope)
      ──NO──► "Mis asambleas" UI
```

**ROOT CAUSE:** The convocation flow creates and sends `convocation_recipients` but **never materializes `assembly_participants` rows** for convoked owners with a `UserId`. The owner portal (and `/api/assemblies`) scopes visibility exclusively through `assembly_participants.UserId`. Irving is a valid convocation recipient but was never enrolled as an assembly participant, so every owner-facing assembly query returns an empty set for this assembly.

**Contributing domain gap:** `CreateAndScheduleAsync` only auto-registers the **creator** as participant. `ConvocationService.SendAsync` dispatches communications only — no participant enrollment.

**User perception gap:** Admin sees convocation sent + assembly in CheckIn; user believed Irving was "acreditado", but DB shows **no participant and no accreditation** for Irving on this assembly. Only president is accredited.

---

## 18. Responsible files (for future remediation — NOT modified in this investigation)

| File | Role |
|------|------|
| `src/Asambleas.Application/Communications/ConvocationService.cs` | `PopulateRecipientsAsync`, `SendAsync` — creates recipients, no participants |
| `src/Asambleas.Application/Calendar/CalendarSchedulingService.cs` | `ScopedAssembliesQuery`, `CreateAndScheduleAsync` (creator-only participant) |
| `src/Asambleas.Application/Assembly/AssemblyService.cs` | `ListForCurrentUserAsync` — participant-only scope |
| `src/Asambleas.Application/Attendance/AttendanceService.cs` | Accreditation requires existing participant |
| `src/Asambleas.Web/wwwroot/js/modules/owner-portal-app.js` | Consumes scoped APIs (not root cause) |

---

## 19. Proposed remediation (plan only — do not implement yet)

**Option A (recommended domain fix):** When convocation is sent (or validated), upsert `AssemblyParticipant` for each recipient with non-null `UserId`, linking `UnitId` from ownership when available.

**Option B (query fix):** Extend owner scope to union `assembly_participants` **OR** `convocation_recipients` with active `UserId` for sent convocations. Requires domain decision on whether convocation alone grants portal visibility before check-in.

**Option C (data repair):** One-time backfill script for existing sent convocations → participants. Does not fix forward flow alone.

**Accreditation follow-up:** After participant enrollment, accreditation flow can work as designed.

---

## 20. Investigation artifacts

- `docs/AUDIT/_tmp-owner-visibility-db.json` — Irving trace snapshot
- `tools/_audit-assembly-2186.cjs` — assembly deep trace (read-only)
- `tools/_audit-owner-api-compare.cjs` — live API comparison phadmin vs owner101

---

## Mandatory verdict block

```text
OWNER ASSEMBLY VISIBILITY — ROOT CAUSE INVESTIGATION

Reproduced: YES

Admin assembly visible: YES
Owner assembly visible: NO

AssemblyId: 2186e056-7800-4d93-9338-8cb3ce33c103
OwnerId: 82d85b69-d18a-4e29-8101-73a18e29635a
UserId: 3100cce3-871b-4574-baf8-9409f8e46720
PHId: 33333333-3333-3333-3333-333333333301
ConvocationId: 5bfa70f0-1a54-4498-b93a-be50c0abb892
RecipientId: 1450260e-d6b9-4dda-a38b-cf2f580c9c0e
AccreditationId: N/A (no assembly_participants row for Irving)

Backend returns assembly to owner: NO

Frontend receives assembly: NO

ROOT CAUSE:
Convocation send creates convocation_recipients but never creates assembly_participants
for convoked owners. Owner portal scopes assemblies exclusively via
assembly_participants.UserId, so convoked-but-not-enrolled owners see zero assemblies.
Irving is a valid recipient (OwnerId/UserId match) but has no participant row on
assembly 2186e056-7800-4d93-9338-8cb3ce33c103. Irving was also not accredited in DB.

RESPONSIBLE LAYER: DOMAIN / DATA RELATIONSHIP (Convocation ↔ Participation gap)

RESPONSIBLE FILES:
- src/Asambleas.Application/Communications/ConvocationService.cs
- src/Asambleas.Application/Calendar/CalendarSchedulingService.cs
- src/Asambleas.Application/Assembly/AssemblyService.cs

WHY ADMIN SEES IT:
Admin has assembly:manage; ScopedAssembliesQuery returns all tenant assemblies
regardless of convocation or participation.

WHY OWNER DOES NOT SEE IT:
No assembly_participants row for UserId 3100cce3-871b-4574-baf8-9409f8e46720 on
assembly 2186e056-7800-4d93-9338-8cb3ce33c103. Both /api/calendar/events and
/api/assemblies filter by participant enrollment only.

RECOMMENDED FIX:
Materialize AssemblyParticipant records for convoked recipients with UserId when
convocation is sent (or at publish time); optionally backfill existing sent convocations.

CONFIDENCE: HIGH
```
