# EO-004 — LIVE AS-IS Assessment

**Date:** 2026-08-08  
**App:** `http://localhost:5188` (Healthy)  
**Assembly:** `44444444-4444-4444-4444-444444444401` — PH DEMO OCEAN TOWER  
**Method:** Browser inspection (President session). Screenshots in `AS-IS/`.  
**Rule:** Observed running UI — not inferred from HTML alone.

---

## 1. Session walked

| Step | Result |
|------|--------|
| App health | Healthy |
| Login as President | Already authenticated as Presidente Asamblea |
| Assembly room open | Operator console |
| Start Assembly (UI confirm) | **PASS** — status → `InProgress` |
| LIVE chip + timer | Visible after start (`EN VIVO 00:00:xx`) |
| Secretary / Owner sessions | Pending follow-up (same shell today) |
| Mobile / tablet viewports | Pending (overflow already broken at ~765px) |
| Projector | Not yet opened this pass |

---

## 2. Mode transition

| Expected | Observed |
|----------|----------|
| NORMAL → START → **FOCUSED LIVE MODE** | **FAIL** — after start, UI is the same admin cockpit; `data-mode` / focused live shell absent |
| Admin nav minimized | **FAIL** — “Panel de asamblea” + full action set remain |
| Assembly dominates | **PARTIAL** — stage exists but competes with invalid controls + overflow |

---

## 3. President / Operator LIVE

### What works
- Start assembly confirmation dialog
- LIVE label + duration after `InProgress`
- SignalR connection banner “Conectado”
- Quorum chip (compact %) + participant count
- Participant strip with avatars
- Spanish A/V blocked copy (LiveKit unset)
- Empty states WHAT/WHY for motion / voting / speakers

### Critical problems (browser evidence)

1. **Horizontal overflow = FAIL**  
   At client width ~765px: `scrollWidth ≈ 1512`. Stage/actions stretch ~1492px. Participant cards extend to ~1683px. Root cause: grid/flex children without `min-width: 0` + strip expanding page instead of containing scroll.

2. **Dead / invalid actions visible during LIVE**  
   While `InProgress`: **Iniciar asamblea**, **Reanudar** still shown and enabled. Violates EO-004 §63–64 / §113.

3. **No state-aware action bar**  
   Pause / End always present; Open Voting shown with no motion.

4. **No FOCUSED LIVE shell**  
   Same layout as pre-start; no `data-mode="live"` emphasis.

5. **Clipped stage copy**  
   “Sala en espera” / A/V notice truncates on narrow widths.

6. **Connection-lost overlay in a11y tree**  
   Hidden overlay still announced as heading (inert/aria incomplete in practice).

7. **Agenda below fold / weak “punto actual”**  
   No clear CURRENT ITEM 03/06 treatment in viewport.

8. **Quorum not interactive**  
   No hover/details (present units / threshold / last update).

9. **LiveKit**  
   **BLOCKED** — governance continues (good), media absent.

10. **Timer source**  
    Client-side from `startedAtUtc` after start/hydrate — needs verification against authoritative backend started time on refresh (EO-004 §11).

---

## 4. Owner / Secretary (expected gaps)

Shared `assembly.html` + CSS role chrome. No distinct Secretary density. Owner mobile sticky voting exists from EO-003 CSS but not validated LIVE this pass. Owner request-speak → queue position feedback incomplete vs §42.

---

## 5. Realtime / voting / reconnect

| Area | AS-IS |
|------|-------|
| Voting ceremony | Select → Review → Confirm (EO-003) — not retested LIVE yet |
| Unknown vote / reconnect during vote | Incomplete vs §36 / §52 |
| Event coalescing / focus preserve | Not verified |
| Incident center | Missing |
| Participant drawer / search | Missing |

---

## 6. Priority backlog for EO-004 implementation

| P0 | Item |
|----|------|
| P0 | Fix page horizontal overflow (`min-width: 0`, strip containment) |
| P0 | State-aware president action bar (hide invalid) |
| P0 | FOCUSED LIVE MODE shell + compact live header |
| P0 | Context priority rail (agenda/motion/voting) |
| P0 | Owner mobile voting takeover validation |
| P1 | Quorum header details popover |
| P1 | Speaker request position + “tienes la palabra” |
| P1 | End-assembly precheck |
| P1 | Reconnect-during-vote verification UX |
| P2 | Incident strip, participant drawer |
| BLOCKED | LiveKit A/V |
| NOT EXECUTED | 8-context Playwright, human 8-person test |

---

## 7. Evidence files

- `AS-IS/01-operator-checkin.png` — Check-in operator
- `AS-IS/02-operator-live.png` — Immediately after Start (LIVE)

---

## 8. Verdict

**LIVE experience is functional enough to start/join, but not yet a focused command-center / participant product.**  
Primary defects: **overflow**, **invalid controls**, **missing live mode transition**.  
EO-004 proceeds to fix these with browser QA loop — functionality freeze outside live assembly flow.

---

## Appendix — Progress since AS-IS (same day, later pass)

**Status:** INTERIM fixes landed; EO-004 **NOT CERTIFIED**.

| AS-IS defect | Later status |
|--------------|--------------|
| Horizontal overflow (`scrollWidth ≈ 1512` @ 765px) | **PASS** — `scrollWidth === clientWidth` (765) after CSS containment |
| Dead actions during LIVE (Iniciar/Reanudar) | **PASS** — LIVE shows only Pausar + Cerrar asamblea (+Salir) |
| No `data-mode="live"` | **PASS** — `data-mode="live"` set |
| Quorum not interactive | **PASS** (code/wiring) — details popover |
| Timer authoritative source | **PASS** (code) — `AssemblyStartedAtUtc` on room-state |
| Context priority rail | **PASS** (CSS+JS) — not full multi-context E2E |
| End-assembly precheck | **PASS** (code) — blocks if voting open |
| Owner session | **PASS** (spot) — role=owner, Pedir la palabra + Salir, EN VIVO timer |
| LiveKit A/V | Still **BLOCKED** |
| Secretary distinct UX | Shares Operator viewer (`AssemblyRoomRules`) — **NOT** browser UX-tested this pass |
| 8-context Playwright / human test / mobile 390 / projector | Still **NOT EXECUTED** or **MANUAL ACCEPTANCE REQUIRED** |

See `01-OPERATOR-UX.md` … `EO-004-COMPLETION-REPORT.md`.
