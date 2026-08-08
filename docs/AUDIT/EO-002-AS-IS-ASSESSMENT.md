# EO-002 AS-IS Assessment

**Date:** 2026-08-08  
**Prior EO:** EO-001 (functional vertical slice with blockers)  
**Directive:** STOP feature expansion outside assembly experience.

## Baseline executed

| Check | Result |
|-------|--------|
| `dotnet build` Web | PASS (0 errors) |
| UnitTests | PASS (28) |
| App `/health` | Healthy |
| UI pages | Only `index.html` + `assembly.html` |

## Verdict

Backend domain/API for the core loop is largely **working**. Commercial assembly UX required by EO-002 is largely **missing**. Product is **not commercial-demo-ready**.

## View matrix

| View | Status |
|------|--------|
| Login | Working |
| Assembly dashboard | **Missing** |
| Readiness | **Missing** |
| Check-in / Accreditation UI | **Missing** (silent auto POST) |
| Lobby + device preview | **Missing** |
| Operator cockpit | Partial (same HTML as owner) |
| Owner room | Partial |
| Projector | **Missing** |
| Minutes / Evidence | **Missing** |
| Voting cards + confirm + receipt | **Missing** |
| Reconnect restore | Partial (banner only) |

## Classification

### Existing / Working
Auth, tenancy, seed 8 users, assembly transitions, check-in API, quorum engine + snapshots, speaker queue, motion present, voting integrity + DB unique, decision rule, audit API, SignalR publish path, design tokens, login + room shell.

### Broken / Fragile
Room hydration after F5; agenda/quorum/participants empty until SignalR events; auto check-in fails while Scheduled; operator chrome visible to owners; vote without confirm/receipt; SignalR `JoinAssembly` lacks assembly authz; LiveKit subscribe-only.

### Mocked / Optional
LiveKit A/V without credentials; Workers heartbeat.

### Hardcoded
Seed IDs, MotionId input default, Spanish strings in JS/HTML, demo redirect.

### Missing (EO-002)
Dashboard, readiness, check-in UX, lobby, role-split UIs, voting ceremony, reconnect hydrate APIs, projector, minutes, evidence, i18n, Playwright 8-browser, speaker timer/skip/reject.

## P0 backlog (must resolve)

1. Room hydrate APIs + F5/reconnect REST restore  
2. Role-split Operator vs Owner UI  
3. Voting cards + confirm + receipt  
4. Dashboard + readiness + contextual CTA  
5. Dedicated check-in / accreditation  
6. Dangerous action confirmations  
7. SignalR JoinAssembly authorization  
8. Remove MotionId admin field; motion from real data  
9. Mobile owner voting UX  
10. Honest LiveKit blocked / device lobby path  

## P1

Lobby/device preview, speaker timer/skip/reject, operator tally, premium result, projector, minutes/evidence, Playwright 8 contexts, es-PA/en localization.

## P2–P3

Agenda visual states, participant AV cards, empty/error system, vote timer, WCAG full matrix, perf P95.

## Flow dead-ends

```text
LOGIN ✓ → DASHBOARD ✗ → PREP ✗ → CHECK-IN UI ✗ → LOBBY ✗
→ ROOM partial ✓ → … → CLOSE ✓ → MINUTES ✗ → EVIDENCE ✗
```

## Key paths

- UI: `src/Asambleas.Web/wwwroot/{index,assembly}.html`
- Room JS: `wwwroot/js/modules/room-app.js`
- Hub: `src/Asambleas.Web/Hubs/AssemblyHub.cs`
- EO-001 report: `docs/08-AUDIT/EO-001-COMPLETION-REPORT.md`
