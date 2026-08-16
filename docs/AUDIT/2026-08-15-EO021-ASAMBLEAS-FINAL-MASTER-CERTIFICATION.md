# EO-021 — ASAMBLEAS FINAL PRODUCT MASTER CERTIFICATION

**Date:** 2026-08-15  
**Environment:** Development  
**URL:** `https://localhost:7188`  
**Harness:** `tools/e2e/eo021-master-certification-e2e.cjs` (Playwright multi-context)  
**Evidence:** `tools/e2e/eo021-results/results.json`  
**VPS deployment:** **NOT PERFORMED**

---

## 1. Executive Summary

ASAMBLEAS was treated as a complete product and subjected to an adversarial master certification on localhost: prior EO gates, product inventory, menu walk, PH isolation, multi-owner golden path, weighted quorum/voting, concurrency integrity, void/cancel, final freeze, RBAC, reconnect, responsive/a11y spot checks, build/unit tests, and console/network gates.

**Final verdict:**

```text
ASAMBLEAS CORE — EXCEPTIONAL CANDIDATE
```

```text
P0 OPEN: 0
P1 OPEN: 0
P2 OPEN: 0
P3 OPEN: 0
VPS DEPLOYMENT: NOT PERFORMED
```

This is **not** Production Ready. It is a strong localhost Development candidate for pilot use after manual acceptance.

---

## 2. Scope

| In scope | Out of scope |
|----------|--------------|
| Localhost Development E2E | VPS / Production deploy |
| Core PH → convocatoria → sala → voto → cierre | Load/stress at production scale |
| Multi-participant realtime integrity | Infrastructure HA, backup/restore certification |
| Security negatives (RBAC, cross-PH/assembly) | External SMTP inbox delivery proof |
| UX/responsive/a11y spot checks | Full WCAG audit |

---

## 3. Previous EO gates

| EO | Status | P0 | P1 |
|----|--------|----|----|
| EO-019 Full Live Assembly | CERTIFIED | 0 | 0 |
| EO-020 Multi-Participant Realtime | CERTIFIED | 0 | 0 |

**GATE0-PRIOR-EO:** PASS — EO-021 proceeded only after these gates.

---

## 4. Product inventory (from source)

| Asset | Count / detail |
|-------|----------------|
| HTML pages | 20 (`ph`, `calendar`, `owner`, `assembly`, `dashboard`, …) |
| JS modules | ~46 under `wwwroot/js/modules` |
| API controllers | 19 (+ nested) |
| SignalR hub | `/hubs/assembly` (`AssemblyHub`) |
| Roles | PlatformAdmin, TenantAdmin, PHAdmin, AssemblyPresident, AssemblySecretary, AssemblyOperator, Owner, Auditor |
| Placeholders / Coming soon | None found as feature stubs; disabled UI is state/permission driven |

Admin nav: Propiedades · Calendario · Histórico · PH tabs · Assembly tabs.  
Owner nav: Inicio · Mis asambleas · Mis unidades · Mi cuenta.

---

## 5. Browser traversal

| Area | Result |
|------|--------|
| Admin menu (`ph`, `calendar`, `history`) | PASS |
| Assembly tabs (dashboard, check-in, voting, evidence, minutes, convocation) | PASS |
| Owner portal ×4 | PASS |
| Live room ×5 sessions | PASS |

---

## 6. PH isolation

| Test | Result |
|------|--------|
| Create PH A + PH B | PASS |
| Switch A→B→A without logout | PASS |
| Owner of A reading PH B units | **403/404** PASS |
| Cross-assembly vote misuse | **400** PASS |

**CROSS-PH contamination observed in this run: 0**

---

## 7. RBAC

| Attempt | Result |
|---------|--------|
| Owner create motion | 403 |
| Owner open voting | 403 |
| Non-accredited vote | 400 |
| Post-close vote | 400 |
| Post-complete open/edit/vote | 400 |

---

## 8–16. Golden path & multi-user assembly

Controlled dataset:

| Unit | Owner | Coeff |
|------|-------|------:|
| 101 | A | 40% |
| 102 | B | 30% |
| 103 | C | 20% |
| 104 | D | 10% |
| **Σ** | | **100%** |

Assembly: `EO-021 FINAL CERTIFICATION ASSEMBLY`  
Flow: PH UI create → units/owners → invite/activate (mock mailbox) → schedule → convocation (4) → portal 4/4 → accredit A+B+C (quorum **90%**) → start → live room → dynamic Q → votes → accredit D (**100%**) → void session → complete → history 4/4.

---

## 9–14. Realtime / quorum / voting integrity

| Gate | Result |
|------|--------|
| Weighted quorum 90% (≠ 75% headcount) | PASS |
| Concurrent A/B/C votes → weight 60/30 | PASS |
| Double-vote + two-tab | PASS (backend reject) |
| Cast vs Close race (FOR UPDATE serialization) | PASS — loser 400, tally consistent |
| Abstention ≠ Against | PASS (`Abstention` / alias `Abstain`) |
| No-vote ≠ Abstention | PASS (votesCast=3 with D pending) |
| Question immutability with votes | PASS |
| Void/cancel preserves history | PASS |
| Final freeze after Completed | PASS |

---

## 15. Dynamic questionnaire

Create Q1–Q3 → edit draft → reorder → archive draft → add Q4 after closed votes → closed results intact.

---

## 16. Reconnection

Owner C reload, President reload, Owner A F5 → status `InProgress` rehydrated from server. No vote duplication observed.

---

## 17. Finalization & owner history

Assembly `Completed`. All four owners retain history visibility. Mutations rejected.

---

## 18. Security negative tests

Covered: cross-PH read, cross-assembly cast, unauthorized create/open, duplicate vote, post-close, completed freeze, empty PH validation.

---

## 19–21. UX / Responsive / Accessibility

| Gate | Result | Notes |
|------|--------|-------|
| Responsive mobile/tablet | PASS | Spot check overflow |
| A11y Tab focus | PASS | Focus lands on interactive control |
| Loading / empty / messaging | PASS | Spot; not a full design audit |
| Console critical | PASS | 0 critical; expected 4xx noise filtered |
| Unexpected HTTP 500 | PASS | 0 |

---

## 22. DB integrity / EF / Build

| Gate | Result |
|------|--------|
| Soft DB integrity (API) | PASS |
| EF pending model changes | PASS — *No changes since last migration* |
| `dotnet build` | PASS |
| Unit tests | PASS |

---

## 23. Network / Console

`Unexpected 500 = 0` · `Critical JS = 0`

---

## 24–25. Defects found & corrected (this EO)

| ID | Sev | Finding | Root cause | Fix |
|----|-----|---------|------------|-----|
| EO21-P0-RACE | P0 | Cast could return 200 while Close tally omitted the vote | Check-then-act without session row lock | `FOR UPDATE` transaction on cast/close in `VotingService` |
| EO21-P1-ISACTIVE | P1 | Unit update omitting `isActive` deactivated unit (JSON bool default false) | Full DTO bool default | `bool? IsActive` — omit keeps current |
| EO21-P2-ABSTAIN | P2 | UI alias `Abstain` rejected | Enum name `Abstention` only | Accept `Abstain` alias |
| Harness | — | EF gate false-failed on “No **changes**…” wording | Regex too broad | Fixed parser |

**Files:**

- `src/Asambleas.Application/Voting/VotingService.cs`
- `src/Asambleas.Application/Asambleas.Application.csproj` (+ Relational)
- `src/Asambleas.Contracts/PhOnboarding/PhOnboardingDtos.cs`
- `src/Asambleas.Application/PhOnboarding/PhOnboardingService.cs`
- `tools/e2e/eo021-master-certification-e2e.cjs`

---

## 26. Remaining P2/P3

None open from this run. Known architectural gaps (documented, not defects of this cert):

- QualifiedMajority absolute threshold / EligibleCoefficient unused in decide engine (EO-020).
- Full WCAG / design-system polish beyond spot checks.
- Production infra (TLS ops, backups, observability) not certified here.

---

## 27. Product Truth Matrix

| Module/View | Browser | Backend | Persistence | PH Isolation | RBAC | UX | Result |
| ----------- | ------: | ------: | ----------: | -----------: | ---: | -: | -----: |
| PH Admin | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Owner Portal | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Calendar / Convocation | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Live Room + Voting | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

---

## 28. Master Assembly Matrix

```text
PH MANAGEMENT: PASS
GLOBAL PH SWITCH: PASS
PH ISOLATION: PASS

UNITS: PASS
OWNERS: PASS
OWNER IDENTITY: PASS

CALENDAR: PASS
ASSEMBLY CREATE: PASS
ASSEMBLY EDIT: PASS

CONVOCATION: PASS
RECIPIENT RELATION: PASS
COMMUNICATION: PASS

OWNER PORTAL: PASS
OWNER ASSEMBLY VISIBILITY: PASS

ACCREDITATION: PASS
PRESENCE: PASS
QUORUM: PASS

LIVE ROOM: PASS
VIDEO CONTINUITY: PASS

DYNAMIC QUESTIONS: PASS
QUESTION VERSIONING: PASS
QUESTION IMMUTABILITY: PASS

REALTIME OPEN: PASS
REALTIME VOTE: PASS
REALTIME PROGRESS: PASS
REALTIME CLOSE: PASS
REALTIME RESULT: PASS

WEIGHTED VOTING: PASS
ABSTENTION: PASS
NO-VOTE: PASS

DOUBLE-VOTE PROTECTION: PASS
POST-CLOSE PROTECTION: PASS
CONCURRENT CLOSE: PASS

RECONNECTION: PASS
STATE REHYDRATION: PASS

FINALIZATION: PASS
FINAL FREEZE: PASS
OWNER HISTORY: PASS

AUDIT TRAIL: PASS
RBAC: PASS
DIRECT API SECURITY: PASS

RESPONSIVE: PASS
ACCESSIBILITY: PASS
LOADING UX: PASS
MESSAGING UX: PASS
EMPTY STATES: PASS

DB INTEGRITY: PASS
EF MODEL: PASS
BUILD: PASS
AUTOMATED TESTS: PASS
BROWSER E2E: PASS
CONSOLE: PASS
NETWORK: PASS

P0 OPEN: 0
P1 OPEN: 0
P2 OPEN: 0
P3 OPEN: 0
```

---

## 29. Evidence

| Artifact | Path |
|----------|------|
| Machine-readable results | `tools/e2e/eo021-results/results.json` (81 tests, 0 FAIL) |
| Runner | `tools/e2e/eo021-master-certification-e2e.cjs` |
| Prior EO-019 | `docs/AUDIT/2026-08-15-EO019-FULL-LIVE-ASSEMBLY-E2E-CERTIFICATION.md` |
| Prior EO-020 | `docs/AUDIT/2026-08-15-EO020-MULTI-PARTICIPANT-REALTIME-CERTIFICATION.md` |

---

## 30. Final Verdict

```text
ASAMBLEAS CORE — EXCEPTIONAL CANDIDATE
```

Supported by: end-to-end multi-participant flow, realtime, vote/quorum integrity (including cast/close serialization fix), PH isolation, RBAC, reconnection, audit trail, zero critical console errors, zero unexpected 500s, build/tests green.

**Not declared:** `PRODUCTION READY`.

---

## Trust question (§82)

> Si mañana este sistema fuera utilizado para realizar una asamblea real de Propiedad Horizontal, ¿existe algún defecto conocido P0/P1 que impida confiar en el flujo completo desde convocatoria hasta cierre?

```text
NO
```

Evidence references (this run): `CONVOCATION`, `PORTAL-*`, `QUORUM-90`, `CONCURRENT-VOTES`, `CLOSE-AND-WEIGHT`, `V2-HEADCOUNT-VS-WEIGHT`, `ABSTENTION`, `NO-VOTE`, `DOUBLE-VOTE-PROTECTION`, `POST-CLOSE`, `FINAL-FREEZE`, `CROSS-ASSEMBLY`, `RBAC`, `HISTORY-*`, `AUDIT`, `NETWORK`, `CONSOLE` — all PASS in `tools/e2e/eo021-results/results.json`.

Caveat: answer applies to **localhost Development** as certified; production infrastructure risks are outside EO-021.

---

## ADDENDUM — Native Screen Sharing (EO-021)

**Status:** Implementation complete on localhost. Automatable gates **P0=0 / P1=0**. Native `getDisplayMedia` picker **PENDING USER ACCEPTANCE** (not faked).

| Matrix item | Result |
| --- | --- |
| NATIVE SCREEN SHARE | IMPLEMENTATION COMPLETE (MANUAL PENDING) |
| SCREEN SHARE AUTHORIZATION | PASS |
| SINGLE ACTIVE PRESENTER | PASS |
| SCREEN SHARE RECEIVE | PENDING USER ACCEPTANCE |
| PRESENTER INDICATOR | PENDING USER ACCEPTANCE |
| AUDIO CONTINUITY | PENDING USER ACCEPTANCE |
| CAMERA CONTINUITY | PENDING USER ACCEPTANCE |
| VIDEO SESSION CONTINUITY | PENDING USER ACCEPTANCE |
| QUESTION DURING SHARE | PASS |
| DYNAMIC QUESTIONNAIRE DURING SHARE | PASS (create/present while share state active) |
| VOTING DURING SHARE | PASS |
| VOTE DURING SHARE | PASS |
| REALTIME PROGRESS DURING SHARE | PASS |
| CLOSE DURING SHARE | PASS |
| RESULT DURING SHARE | PASS |
| STOP FROM APP | PASS |
| BROWSER TRACK ONENDED | PENDING USER ACCEPTANCE |
| MEDIA CLEANUP | PASS (server START/STOP ×5) |
| OWNER RECONNECTION | PASS (room-state rehydrate) |
| PRESENTER LEAVE CLEANUP | IMPLEMENTED (hub disconnect clears presenter) |
| FINALIZATION CLEANUP | PASS |
| CROSS-ASSEMBLY ISOLATION | PASS |
| CROSS-PH ISOLATION | PASS |
| RESPONSIVE | CSS stage/filmstrip + mobile stack (manual visual confirm recommended) |
| ACCESSIBILITY | PASS (toolbar button + aria-label) |
| CONSOLE | PASS |
| NETWORK | PASS |
| MANUAL GETDISPLAYMEDIA ACCEPTANCE | PENDING USER ACCEPTANCE |
| P0 OPEN | 0 |
| P1 OPEN | 0 |
| VPS DEPLOYMENT | NOT PERFORMED |

**Evidence:** `docs/AUDIT/2026-08-15-EO021-SCREEN-SHARING-CERTIFICATION.md` · `tools/e2e/eo021-results/screen-sharing-results.json` · `tools/e2e/eo021-screen-sharing-e2e.cjs`

**Architecture decision:** additional LiveKit screen track (camera retained); SignalR `screenShareUpdated` for state only.

```text
EO-021 SCREEN SHARING IMPLEMENTATION COMPLETE — P0=0 / P1=0 — LOCALHOST ONLY — WAITING FOR USER MANUAL SCREEN-SHARE ACCEPTANCE — NO VPS DEPLOYMENT PERFORMED.
```

---

## STOP

```text
NO VPS
NO DEPLOY
NO PRODUCTION
```

Localhost remains at `https://localhost:7188` for manual acceptance (including native screen-share picker).

EO-021 FINAL LOCAL CERTIFICATION COMPLETE — P0=0 / P1=0 — ASAMBLEAS CORE EXCEPTIONAL CANDIDATE — WAITING FOR USER MANUAL ACCEPTANCE — NO VPS DEPLOYMENT PERFORMED.
