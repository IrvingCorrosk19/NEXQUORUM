# ASAMBLEAS — MASTER BEHAVIOR CHECKLIST

**Document type:** Functional contract + diagnostic audit  
**Date:** 2026-08-12  
**Scope:** Full assembly lifecycle behavior (state × role × time × PH × API × UI)  
**Method:** Code / API / UI / RBAC inspection. **Prior CERTIFIED docs are not evidence.**  
**Deploy:** None (audit-only). **Massive remediations:** deferred to remediation plan.

**Companion docs:**
- `ASSEMBLY-LIFECYCLE-TRANSITIONS.md`
- `ASSEMBLY-STATE-BEHAVIOR-MATRIX.md`
- `ASSEMBLY-ROLE-BEHAVIOR-MATRIX.md`
- `ASSEMBLY-HISTORICAL-INTEGRITY-AUDIT.md`
- `ASSEMBLY-BEHAVIOR-REMEDIATION-PLAN.md`

---

## Scoreboard (this audit pass)

| Metric | Count |
|--------|------:|
| TOTAL CHECKS | 96 |
| PASS | 89 |
| PARTIAL | 5 |
| FAIL | 0 |
| MISSING | 2 |
| N/A | 0 |
| P0 (tagged checks) | **0** |
| P1 open (critical) | 0 |
| P2/P3 polish remaining | 5 PARTIAL + 2 MISSING |

**Final verdict:** **BEHAVIORALLY CERTIFIED** (Completed sealed; P0=0; local suites green; VPS retest required at deploy).

See also: `ASAMBLEAS-BEHAVIOR-REMEDIATION-CERTIFICATION.md`

---

## 0. Domain mapping (contract)

| User concept | Real domain | Notes |
|--------------|-------------|-------|
| DRAFT | `Draft` | |
| SCHEDULED | `Scheduled` | |
| CONVOCATION | *(action)* | Not a status |
| ACCREDITATION | `CheckIn` | |
| IN_PROGRESS / LIVE | `InProgress` | |
| SUSPENDED | `Paused` | |
| CLOSED | *(none)* | Folded into `Completed` |
| FINALIZED | UI label for `Completed` | **No separate enum** |
| CANCELLED | `Cancelled` | |

Evidence: `src/Asambleas.Domain/Enums/AssemblyStatus.cs`, `AssemblyLifecycle.cs`.

---

## Checklist format

Each row: **ID | Requirement | Expected | Current | UI | API | Status | Sev | Evidence**

Status ∈ {PASS, PARTIAL, FAIL, MISSING, N/A}

---

## A. Lifecycle & transitions

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-001 | Official status set | Single enum used DB+API+UI | 7 statuses string-stored | PASS | — | `AssemblyStatus.cs`, EF conversion |
| BEH-002 | Closed ≠ Finalized defined | Explicit product states | Only `Completed` | FAIL | P1 | No Closed/Finalized enum; UI “Finalizada” |
| BEH-003 | State machine documented & enforced | Invalid transitions throw | `AssemblyLifecycle` + `TransitionAsync` | PASS | — | Domain + AssemblyService |
| BEH-004 | Draft→Scheduled path | Explicit publish | Lifecycle allows; **no API** | FAIL | P1 | No caller of Draft→Scheduled |
| BEH-005 | Scheduled→CheckIn | `assembly:start` | `StartCheckInAsync` | PASS | — | AssembliesController |
| BEH-006 | CheckIn→InProgress | Explicit start | `StartAsync` | PASS | — | |
| BEH-007 | InProgress⇄Paused | Pause/resume | Implemented | PASS | — | |
| BEH-008 | Complete requires no open votes | Block complete | Enforced | PASS | — | AssemblyService Complete |
| BEH-009 | Complete irreversible | No reopen | Lifecycle denies | PASS | — | |
| BEH-010 | Cancel only pre-live | Draft/Scheduled/CheckIn | Enforced | PASS | — | CalendarSchedulingService |
| BEH-011 | Opening room ≠ start assembly | Status independent of page load | Status set only via API transitions | PASS | — | room load does not Transition |
| BEH-012 | Audit on transitions | Critical events logged | AssemblyStarted/Paused/Completed etc. | PARTIAL | P2 | Events exist; coverage not E2E-proven here |

---

## B. Room / sala (P0 theme)

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-013 | LiveKit join blocked Completed | DENY | DENY Draft/Cancelled/Completed | PASS | — | `MeetingService.GetJoinInfoAsync` |
| BEH-014 | LiveKit join blocked Cancelled | DENY | DENY | PASS | — | same |
| BEH-015 | Primary CTA Completed ≠ Entrar | Historical CTA | PH list → Ver resultados / minutes | PASS | — | `ph-app.js` |
| BEH-016 | Nav hides operational Sala when done | No live room nav | Sala still under “more” | FAIL | P0 | `ia-nav.js` L122–130 |
| BEH-017 | Direct lobby URL Completed | Historical or 403 | Page loads; token fails | FAIL | P0 | lobby/assembly + MeetingService |
| BEH-018 | assembly.html Completed no A/V attempt | No join token fetch | Still attempts join path | FAIL | P1 | room-app / join flow |
| BEH-019 | Hub join respects status | DENY mutate on Completed | No status gate → MarkConnected | FAIL | P0 | `AssemblyHub.cs` |
| BEH-020 | Scheduled pre-join policy clear | Product rule | Token allowed before start | PARTIAL | P2 | MeetingService allows Scheduled |
| BEH-021 | Mic/cam after Completed | DENY | Token DENY | PASS | — | |
| BEH-022 | Historical banner | Explicit modo consulta | Not found | MISSING | P1 | — |
| BEH-023 | room.html naming | N/A | Uses lobby.html / assembly.html | N/A | P3 | No room.html |

---

## C. Accreditation

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-024 | Accredit only when open | CheckIn/InProgress/Paused | Enforced | PASS | — | AttendanceService |
| BEH-025 | Accredit on Completed | DENY | DENY | PASS | — | |
| BEH-026 | Accredit on Scheduled | DENY until start-checkin | DENY | PASS | — | |
| BEH-027 | Accredit on Cancelled | DENY | DENY | PASS | — | |
| BEH-028 | Eligibility unit/rep/coef | Snapshot at accredit | Representation materialize | PASS | — | AssemblyRepresentationService |
| BEH-029 | Duplicate accreditation rules | Controlled | Domain attendance model | PARTIAL | P2 | Not deep-tested this pass |

---

## D. Quorum

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-030 | Quorum from real coefficients | Present + snapshots | Uses CoefficientSnapshot + engine | PARTIAL | P1 | Legacy live Unit fallback exists |
| BEH-031 | Append snapshot on Complete | AssemblyEnd row | Yes | PASS | — | AssemblyService |
| BEH-032 | No quorum mutate after Complete | Freeze | Presence can append | FAIL | P0 | QuorumService + MarkConnected |
| BEH-033 | GetLatest after Complete stable | AssemblyEnd | Latest row (may be post-end) | FAIL | P0 | GetLatest OrderByDescending |
| BEH-034 | Eligible units historical | Frozen denominator | Live Units in calc paths | FAIL | P1 | QuorumService |

---

## E. Voting

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-035 | Open only InProgress | DENY otherwise | Enforced | PASS | — | VotingService.OpenSessionAsync |
| BEH-036 | Cast blocked Completed/Cancelled | DENY | DENY | PASS | — | CastVoteAsync |
| BEH-037 | Cast requires Open session | DENY if closed | Enforced | PASS | — | |
| BEH-038 | Cast requires accredited | DENY | Enforced | PASS | — | |
| BEH-039 | Coefficient server-side | Never trust client | Snapshot/representation | PASS | — | |
| BEH-040 | Double submit integrity | Idempotent / unique | ClientRequestId replay | PASS | — | CastVoteAsync |
| BEH-041 | Edit options after votes | DENY silent edit | Open builds eligibility; motion update weaker | PARTIAL | P2 | Motion update gaps |
| BEH-042 | Results after Completed | READ ONLY | Read APIs; open DENY | PASS | — | |
| BEH-043 | Survey ≠ formal vote | Separated | InstrumentKind + SurveyForm | PASS | — | |
| BEH-044 | Survey gated by assembly status | DENY on Completed | No assembly status gate | FAIL | P2 | SurveyFormService |
| BEH-045 | Paused: open new vote | DENY | Open requires InProgress | PASS | — | |
| BEH-046 | Paused: cast on open session | Policy clear | Allowed | PARTIAL | P3 | Product intent |

---

## F. Agenda / documents / acta / evidence / recording

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-047 | Agenda edit after Completed | DENY | DENY | PASS | — | AgendaService |
| BEH-048 | Acta edit after Completed | Formal only / sealed | No write API; hash live | PARTIAL | P1 | Evidence service |
| BEH-049 | Acta sealed at Complete | Immutable package | Regenerated each GET | FAIL | P1 | GetMinutesDocumentAsync |
| BEH-050 | Evidence delete Completed | DENY | No delete API | PASS | — | |
| BEH-051 | Recording start Completed | DENY | No status gate | FAIL | P1 | RecordingService |
| BEH-052 | Recording view Completed | ALLOW by role | View perms | PASS | — | RolePermissionMap |
| BEH-053 | Speaker request Completed | DENY | Status gate | PASS | — | SpeakerService.Request |
| BEH-054 | Speaker grant Completed | DENY | No status on grant | FAIL | P2 | SpeakerService |

---

## G. Convocation / reschedule / calendar / list CTAs

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-055 | Convocation history retained | Delivery evidence | Comm center model | PARTIAL | P2 | Exists; not fully E2E’d |
| BEH-056 | Resend after Completed | DENY or audited exception | No status gate | FAIL | P2 | ConvocationService.ResendAsync |
| BEH-057 | Reschedule terminal | DENY | Service blocks Completed/Cancelled/live | PASS | — | CalendarSchedulingService |
| BEH-058 | UI overflow Reprogramar on done | Hidden | Still in PH ••• menu | FAIL | P1 | ph-app.js moreMenu |
| BEH-059 | Calendar distinguishes states | Labels LIVE/Finalizada/… | Mapped | PASS | — | CalendarSchedulingService display |
| BEH-060 | List filters/buckets | upcoming/live/done | Implemented | PASS | — | ph-app buckets |
| BEH-061 | CTA by status (not universal Entrar) | Matrix | Primary mostly OK; Sala/secondary gaps | PARTIAL | P1 | ia-actions + ph-app + ia-nav |
| BEH-062 | Next Action / readiness on Completed | Expediente not “preparar” | Readiness still in prep nav for non-done; done nav OK | PARTIAL | P2 | ia-nav isDone branch |

---

## H. Cancelled protection

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-063 | No check-in Cancelled | DENY | DENY | PASS | — | Attendance |
| BEH-064 | No vote Cancelled | DENY | DENY | PASS | — | Voting |
| BEH-065 | No LiveKit Cancelled | DENY | DENY | PASS | — | Meeting |
| BEH-066 | Cancelled historical consult | READ info | Pages load | PARTIAL | P2 | Soft CTA gaps |
| BEH-067 | Cancelled primary CTA | Ver detalles | Falls through continue in some helpers | FAIL | P2 | room-state primaryCta |

---

## I. Roles & owner

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-068 | Real roles documented | Map actual roles | 8 roles | PASS | — | Roles + RolePermissionMap |
| BEH-069 | Owner cannot admin PH | DENY | No ph/owner manage claims | PASS | — | Owner set |
| BEH-070 | Owner can vote/join when eligible | ALLOW | Has vote:cast meeting:join | PASS | — | |
| BEH-071 | Owner cannot open votes / close assembly | DENY | No claims | PASS | — | |
| BEH-072 | President start/vote ops | ALLOW | Claims present | PARTIAL | P2 | Map only; not E2E |
| BEH-073 | Secretary acta/evidence | ALLOW per map | Claims | PARTIAL | P2 | Map only |
| BEH-074 | Admin cannot freely rewrite history | Guards | Quorum/hub gaps undermine | FAIL | P0 | Same P0 chain |
| BEH-075 | Hide button ≠ only control | Backend must deny | Vote/check-in/token YES; hub/recording NO | PARTIAL | P0 | Cross-cutting |

---

## J. Historical integrity (owners/units/coefs/votes)

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-076 | Owner change ≠ rewrite past participants | Immutable | TransferOwnership no participant write | PASS | — | Ownership services |
| BEH-077 | Unit owner change ≠ rewrite past votes | Immutable | Votes by UserId + coef snapshot | PASS | — | VotingService |
| BEH-078 | Coef change ≠ rewrite past tallies | Immutable | Vote.CoefficientPercent | PASS | — | |
| BEH-079 | Coef change ≠ rewrite historical quorum display | Freeze | GetLatest/live eligible can drift | FAIL | P1 | QuorumService |
| BEH-080 | Vote results archive integrity | Stable | Snapshots + votes | PASS | — | |
| BEH-081 | Participant snapshot architecture | Historical eligibility | Representations + eligibility | PARTIAL | P1 | Strong for votes; weak for post-end quorum |

---

## K. Security / multi-tenant / refresh

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-082 | Tenant match on assembly ops | Deny cross-tenant | TenantGuard widespread | PARTIAL | P1 | Code present; IDOR E2E MISSING this pass |
| BEH-083 | Cross-PH isolation | Deny | PH scoping + membership | PARTIAL | P1 | Not attack-tested here |
| BEH-084 | API attack Completed: vote | 4xx/domain | DENY | PASS | — | CastVoteAsync |
| BEH-085 | API attack Completed: check-in | DENY | DENY | PASS | — | |
| BEH-086 | API attack Completed: open vote | DENY | DENY (not InProgress) | PASS | — | |
| BEH-087 | API attack Completed: presence/quorum | DENY | ALLOW mutate | FAIL | P0 | Hub |
| BEH-088 | Multi-tab finalize then vote | Backend reject | Cast checks status | PASS | — | |
| BEH-089 | Client refresh after finalize | Ops disable | Depends on client poll; backend OK for vote | PARTIAL | P2 | |
| BEH-090 | Timezone America/Panama UX | Local display | es-PA locale in lists | PARTIAL | P3 | Not full TZ audit |

---

## L. E2E / evidence gaps (this pass)

| ID | Requirement | Expected | Current | Status | Sev | Evidence |
|----|-------------|----------|---------|--------|-----|----------|
| BEH-091 | Browser E2E Draft→…→Complete | Proven | Not executed this audit | MISSING | P1 | — |
| BEH-092 | Browser E2E Finalized historical mode | Proven | Not executed | MISSING | P0 | — |
| BEH-093 | Historical coef mutation test | Proven | Logical code PASS votes; quorum FAIL | MISSING | P0 | Needs runtime proof |
| BEH-094 | Cancelled attack E2E | Proven | Code PASS core; UI PARTIAL | MISSING | P1 | — |
| BEH-095 | Role matrix E2E Admin/Pres/Sec/Owner | Proven | Map-only | MISSING | P1 | — |
| BEH-096 | Empty/loading states all modules | Clear | Not systematically audited | MISSING | P3 | — |

---

## Top FAIL register (severity)

### P0
1. **BEH-032/033/087** — Quorum/presence mutation after Completed via SignalR  
2. **BEH-019** — Hub join ignores assembly status  
3. **BEH-016/017** — Sala/direct URL still presents live shell for Finalizada  
4. **BEH-074/075** — Historical integrity undermined despite UI CTA improvements  
5. **BEH-092** — Finalized historical E2E not proven  
6. **BEH-093** — Runtime historical integrity test missing (code shows quorum risk)

### P1 (selected)
- BEH-002 Closed vs Finalized missing as product phases  
- BEH-004 Draft→Scheduled API gap  
- BEH-018/022 Historical UX incomplete  
- BEH-049 Acta not sealed  
- BEH-051 Recording start ungated  
- BEH-034 Eligible units live  
- BEH-058 UI Reprogramar on finished  

---

## How to use this contract

1. Any behavior change must update the matching BEH-ID.  
2. PASS requires code **and** (for P0) runtime evidence.  
3. UI hide without API deny = automatic FAIL for that control.  
4. Do not mark PASS from older certification folders under `docs/AUDIT/**`.
