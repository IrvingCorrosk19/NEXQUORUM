# EO-003 UIX Audit (INTERIM)

**Date:** 2026-08-08  
**Rule:** FUNCTIONALITY FREEZE — visual/interaction excellence only.  
**Baseline:** `00-SCREEN-INVENTORY.md` problem set.  
**Scoring:** 0–100 honest; not certified. Target band AFTER this pass: ~62–78 where work landed; lower where untouched.

## Score summary

| # | Screen | BEFORE | AFTER | Δ | Verdict |
|---|--------|-------:|------:|--:|---------|
| 1 | Login | 48 | 62 | +14 | Improved tokens/atmosphere; still form-template |
| 2 | Dashboard / Preparation | 42 | 72 | +30 | CTA above fold; readiness demoted from faux-CTA |
| 3 | Check-in / Accreditation | 45 | 65 | +20 | Usable; tablet grid speed still weak |
| 4 | Lobby + Device Preview | 48 | 68 | +20 | Human ES copy for AV block; inline debt remains |
| 5 | Assembly — Operator | 40 | 74 | +34 | Hierarchy + empty states + role chrome |
| 6 | Assembly — Owner | 38 | 72 | +34 | Sticky voting; “Pedir la palabra” owner-only fixed |
| 7 | Voting (in-room) | 44 | 76 | +32 | SELECT → Review → confirm → receipt |
| 8 | Projector | 42 | 70 | +28 | Distance typography improved |
| 9 | Minutes / Evidence | 35 | 42 | +7 | Still largely raw/admin dump |
| 10 | Reconnect / banners | 50 | 64 | +14 | Present; visual stress not fully validated |

**Weighted room-critical average (2–8):** BEFORE ~42 → AFTER ~71.

---

## Per-screen justification

### 1. Login — 48 → 62
- **BEFORE:** Soft gradient only; demo picker low contrast; card feels template.
- **AFTER:** V2 surfaces/text tokens; clearer focus tokens.
- **Gap:** Brand atmosphere still weak; not thumb-optimized.

### 2. Dashboard — 42 → 72
- **BEFORE:** `LISTO PARA INICIAR` competed with primary CTA; CTA below fold; LiveKit English blocker.
- **AFTER:** Primary CTA above fold; readiness styled as status (not button); Spanish human AV messaging where wired.
- **Gap:** Secondary link crowding; header not fully “command” oriented.

### 3. Check-in — 45 → 65
- **BEFORE:** Full-width stacked cards; tablet path slow; focus hierarchy weak.
- **AFTER:** Tokenized cards/status; flow intact.
- **Gap:** 768×1024 density/grid not proven; success→next-person ceremony still soft. **MANUAL ACCEPTANCE REQUIRED** for tablet operator speed.

### 4. Lobby — 48 → 68
- **BEFORE:** Technical LiveKit English; heavy inline styles.
- **AFTER:** Spanish human empty-state (WHAT/WHY); empty motion compact.
- **Gap:** Inline styles remain; full device-preview polish incomplete. LiveKit A/V **BLOCKED**.

### 5. Operator cockpit — 40 → 74
- **BEFORE:** End/Pause/Logout same visual weight; no adaptive priority; large empty motion; header clipping into video stage.
- **AFTER:** Danger End separated; ghost meta actions; `data-voting` / `data-priority`; compact WHAT/WHY/NEXT empties; quorum metric animation + required label; numbered speaker queue with wait; header auto-height (`min-height` not fixed clip).
- **Gap:** Participant strip still weak; no participant drawer; operator stress / 8-user realtime **NOT EXECUTED**.

### 6. Owner room — 38 → 72
- **BEFORE:** Operator chrome leaked (“Pedir la palabra” visible to operator); voting not sticky on mobile.
- **AFTER:** `applyRoleChrome` + owner-only speak; sticky vote panel when `data-role=owner` + `data-voting=open`.
- **Gap:** Secondary panels still compete on small viewports; 390-first polish incomplete. Landscape **NOT fully verified**.

### 7. Voting — 44 → 76
- **BEFORE:** Confirm dialog weak; failure raw; no sticky mobile path.
- **AFTER:** Ceremony: SELECT → Review confirm button → confirm dialog → receipt; human failure copy; sticky owner voting.
- **Gap:** Premium results ceremony still basic bars; multi-browser vote drill **NOT EXECUTED**.

### 8. Projector — 42 → 70
- **BEFORE:** Not distance-readable.
- **AFTER:** `projector.css` distance typography + inverse surfaces.
- **Gap:** Full hall-distance visual QA **MANUAL ACCEPTANCE REQUIRED**.

### 9. Minutes / Evidence — 35 → 42
- **BEFORE/AFTER:** Largely JSON/`<pre>` admin presentation. Token page chrome only.
- **Gap:** Premium artifact UI not done this pass.

### 10. Reconnect — 50 → 64
- **BEFORE:** Banner + sync language rough.
- **AFTER:** Banner/`aria-live` path exists; Spanish-oriented copy improved in related surfaces.
- **Gap:** Overlay polish + forced disconnect visual drill incomplete.

---

## Experience gates (honest)

| Gate | Answer |
|------|--------|
| Show paying client the room UI today? | **Improved — not certified** |
| Non-technical owner vote on phone? | **Intended sticky path — MANUAL ACCEPTANCE REQUIRED** |
| Operator without cognitive thrash? | **Better hierarchy; stress test NOT EXECUTED** |
| Projector hall-ready? | **Typography better; distance QA pending** |
| Minutes/Evidence premium? | **No** |
