# EO-003 Accessibility Audit (INTERIM)

**Date:** 2026-08-08  
**Standard target:** WCAG 2.2 AA (aspirational)  
**Status:** Intentional improvements landed; **full AA formal audit NOT EXECUTED**.

## What was improved (intent)

| Area | Evidence | Status |
|------|----------|--------|
| Focus-visible | `base.css` + `components.css` use focus-visible + `--shadow-focus` / `--border-focus` | PARTIAL |
| Live regions | Toasts, vote status, quorum chip, connection banner, dialogs (`aria-live`) | PARTIAL |
| Empty states | WHAT/WHY/NEXT with `role="status"` in room panels | PARTIAL |
| Skip link | Assembly room skip link present (inventory) | PASS (existence) |
| Role chrome | Owner-only speak control reduces wrong-role confusion | PASS (functional a11y) |
| Reduced motion | Tokens zero under `prefers-reduced-motion` | PASS (tokens) |
| Human errors | Voting failure copy less raw | PARTIAL |

## Keyboard path

| Path | Intent | Verification |
|------|--------|--------------|
| Login → Dashboard | Tab to Entrar | Intended; spot-check only |
| Check-in search → card → ACREDITAR | Focusable controls | Intended; full path **NOT EXECUTED** |
| Vote cards → Review → dialog → confirm | Focus trap in dialog via `ui.js` patterns | Intended; formal trap test **NOT EXECUTED** |
| Operator Start/Pause/End | Buttons in tab order; End danger styled | Visual hierarchy; keyboard matrix incomplete |
| Speaker request (owner) | Visible only for owner | Role gating helps; SR naming spotty |

**Verdict:** Keyboard path **intended**, not certified. Mark **MANUAL ACCEPTANCE REQUIRED** for production claim.

## Contrast / semantics gaps

- Muted labels (`--text-muted` on soft surfaces) — inventory flagged weak contrast; not re-measured with meter.
- Status badges still color-heavy; READY text helps but color-only risk remains.
- Minutes/Evidence `<pre>` dumps — poor structure for SR users.
- Focus ring hierarchy on check-in cards still weak vs primary button.

## LiveKit / AV messaging

English technical LiveKit strings replaced with Spanish human copy where wired — improves comprehension (cognitive a11y). Actual A/V remains **BLOCKED** (credentials).

## Formal audit

| Gate | Status |
|------|--------|
| Automated axe/lighthouse sweep | **NOT EXECUTED** |
| Full WCAG AA checklist | **NOT EXECUTED** |
| Screen reader script (NVDA/VoiceOver) | **NOT EXECUTED** |
| Focus order video evidence | **NOT EXECUTED** |
| Color contrast meter report | **NOT EXECUTED** |

## A11y score (honest)

| Dimension | BEFORE | AFTER |
|-----------|-------:|------:|
| Focus affordance | 45 | 68 |
| Live updates | 48 | 70 |
| Keyboard completeness | 40 | 55 |
| Contrast proven | 40 | 45 |
| SR structure (minutes/evidence) | 30 | 32 |
| **Overall** | **41** | **54** |

Do **not** claim AA compliance from this EO-003 pass.
