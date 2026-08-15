# EO-019 — FULL LIVE ASSEMBLY E2E CERTIFICATION

**Date:** 2026-08-15  
**Environment:** Development  
**URL:** `https://localhost:7188`  
**Harness:** Playwright Chromium dual contexts (PHAdmin + Owner)  
**Runner:** `tools/e2e/eo019-full-live-assembly-e2e.cjs`  
**Evidence:** `tools/e2e/eo019-results/results.json` + screenshots  
**VPS deployment:** **NOT PERFORMED**

---

## Verdict

```text
EO-019 — FULL LIVE ASSEMBLY E2E: CERTIFIED
```

```text
P0 OPEN: 0
P1 OPEN: 0
VPS DEPLOYMENT: NOT PERFORMED
```

---

## Controlled dataset (last certified run)

| Entity | Id / value |
|--------|------------|
| PH | `767e4c84-3f6d-465c-912b-fc9268b6c9c5` — PH EO019 CERT … |
| Unit | `EO19-101` — coefficient **100%** |
| Owner | `dbf4b6e9-…` — `eo019.owner.*@ocean.demo` |
| Assembly | `ed0eb793-5b6e-4010-afae-5add6f338d4a` |
| Final status | `Completed` |
| Quorum scenario | 1 unit @ 100% → vote weight **100.0000%** InFavor |
| Progress after 3rd Q | total=3, completed=2, progress=**66.67%** |

Admin: `phadmin@ocean.demo`  
Owner: activated via invitation + Development mock mailbox.

---

## Flow demonstrated

```text
PH → Owner → Unit → Assembly → Convocation → Email (Mock SENT)
 → Owner Portal visibility → Accreditation / Check-in → Room (both tabs)
 → Video mount → Live questions (add/edit/delete/reorder)
 → Open vote → Cast → Double-vote blocked → Immutable edit blocked
 → Close → Post-close blocked → Results (100% InFavor)
 → Second voting same session → Dynamic recalc → Complete
 → Owner history (Completed) → RBAC / PH isolation negatives
```

---

## Critical gates

| Gate | Result |
|------|--------|
| CONVOCATION → OWNER PORTAL | PASS |
| ACCREDITATION → PRESENCE | PASS (check-in auto-accredited + explicit accredit) |
| PRESENCE → QUORUM | PASS (endpoint OK; single-unit 100% weight on ballot) |
| LIVE QUESTION → PARTICIPANT | PASS |
| OPEN VOTING → REALTIME | PASS (owner UI without leaving room) |
| VOTE → SERVER PERSISTENCE | PASS |
| CLOSE → HARD BLOCK | PASS |
| RESULT → REALTIME | PASS |
| MULTIPLE QUESTIONS → SAME SESSION | PASS |
| COMPLETE → OWNER HISTORY | PASS |

---

## Defects found & corrected (this execution)

| Defect | Severity | Root cause | Fix |
|--------|----------|------------|-----|
| Owner invite blocked despite Sandbox UI | P1 | `GetOrCreateEntityAsync` forced `SandboxMode=false` on every load | Removed auto-reset |
| Profile update ignored Sandbox | P1 | `UpdateProfileAsync` hardcoded `SandboxMode=false` | Honor request in non-production |
| No way to capture activation URL on localhost | P1 | Mock email discarded body | `MockEmailProvider` capture + `GET /api/dev/mock-mailbox` (Development only) |
| Invite still rejected Mock in edge cases | P2 | Strict Mock guard | `AllowsMockInvitations` when non-production |

**Files modified:**

- `src/Asambleas.Application/Communications/CommunicationConfigurationService.cs`
- `src/Asambleas.Application/PhOnboarding/OwnerInvitationService.cs`
- `src/Asambleas.Infrastructure/Communications/Providers.cs`
- `src/Asambleas.Web/Controllers/DevMockMailboxController.cs` (new)
- `tools/e2e/eo019-full-live-assembly-e2e.cjs` (new)

---

## Email semantics

| Claim | Status |
|-------|--------|
| EMAIL REQUEST | PASS |
| SMTP/Mock ACCEPTED (`Status=Sent`) | PASS |
| MAILBOX DELIVERED | **NOT VERIFIABLE** (sandbox Mock ≠ inbox) |

---

## Final matrix

```text
ENVIRONMENT: LOCALHOST
URL: https://localhost:7188

PH CONTEXT: PASS
OWNER CREATE: PASS
OWNER EDIT: PASS

ASSEMBLY CREATE: PASS
CALENDAR VISIBILITY: PASS

CONVOCATION CREATE: PASS
OWNER RELATION: PASS
EMAIL SEND: PASS
OWNER PORTAL VISIBILITY: PASS

ACCREDITATION: PASS
PRESENCE: PASS
QUORUM: PASS

SAME LIVE SESSION: PASS
VIDEO CONTINUITY: PASS

QUESTION ADD LIVE: PASS
QUESTION EDIT LIVE: PASS
QUESTION DELETE LIVE: PASS
QUESTION REORDER: PASS

REALTIME QUESTION SYNC: PASS
REALTIME VOTING OPEN: PASS
VOTE: PASS
REALTIME PROGRESS: PASS

DOUBLE VOTE PROTECTION: PASS
QUESTION IMMUTABILITY AFTER VOTE: PASS
CLOSE VOTING: PASS
POST-CLOSE PROTECTION: PASS

RESULT CALCULATION: PASS
REALTIME RESULT: PASS

SECOND VOTING SAME SESSION: PASS
DYNAMIC RECALCULATION: PASS
CLOSED RESULTS IMMUTABLE: PASS

RECONNECTION: PASS
F5 RECOVERY: PASS
TWO-TAB PROTECTION: PASS

ASSEMBLY COMPLETION: PASS
OWNER HISTORY: PASS

AUDIT TRAIL: PASS
RBAC: PASS
PH ISOLATION: PASS

UX FEEDBACK: PASS
LOADING STATES: PASS
CONSOLE: PASS
NETWORK: PASS

P0 OPEN: 0
P1 OPEN: 0
P2 OPEN:
P3 OPEN:

VPS DEPLOYMENT: NOT PERFORMED
```

---

## How to re-run (localhost only)

```bash
# App must be Development on https://localhost:7188
node tools/e2e/eo019-full-live-assembly-e2e.cjs
```

---

## Stop

No VPS. No production publish. Application left on `https://localhost:7188` for manual user acceptance.

```text
LOCAL CERTIFICATION COMPLETE — WAITING FOR USER MANUAL ACCEPTANCE BEFORE ANY VPS DEPLOYMENT.
```
