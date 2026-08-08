# EO-003 Responsive Audit (INTERIM)

**Date:** 2026-08-08  
**App:** `http://localhost:5188`  
**Breakpoints (tokens):** 390 / 768 / 1024 / 1366

## Intent vs verification

| Viewport / path | Intent this pass | Verification | Status |
|-----------------|------------------|--------------|--------|
| Owner mobile voting (~390) | Sticky `#vote-panel` when `data-role=owner` + `data-voting=open` | CSS wired in `assembly-room.css` | **MANUAL ACCEPTANCE REQUIRED** (device/browser drill) |
| Operator desktop (≥1024) | Cockpit hierarchy; danger End separated | Browser walkthrough (partial) | PARTIAL PASS |
| Check-in tablet (768×1024) | Faster grid / less full-width stack | Not proven this pass | **MANUAL ACCEPTANCE REQUIRED** |
| Landscape phone/tablet | Usable room chrome without clip | Header auto-height fixed clip risk; landscape matrix | **NOT fully verified** → **MANUAL ACCEPTANCE REQUIRED** |
| Projector large display | Distance typography | CSS updated; hall distance | **MANUAL ACCEPTANCE REQUIRED** |
| Dashboard short viewport | CTA above fold | Prior subagent / this session intent | PARTIAL PASS |
| 8 concurrent visual users | Stress layout | — | **NOT EXECUTED** |

## Per-surface notes

### Login
Usable; not thumb-first. No dedicated mobile redesign this pass.

### Dashboard
CTA placement improved for shorter viewports. Secondary links still crowded on narrow widths.

### Check-in
Mobile OK for search→accredit. Tablet still underuses horizontal space (inventory P0). **Do not claim tablet-optimized.**

### Lobby
Device preview usable; inline layout debt may fight small heights.

### Assembly room
- **Owner sticky voting:** intended and CSS-present; certify on real 390 CSS px width with open vote.
- **Header:** `min-height` (auto growth) replaces clipping into video stage.
- **Sidebar:** stacks on small widths — operator path remains desktop-biased.
- **Landscape:** not fully verified; expect metric/header wrap — accept manually.

### Projector
Typography scaled for distance; physical projector QA pending.

## Responsive score (honest)

| Dimension | BEFORE | AFTER |
|-----------|-------:|------:|
| Owner mobile vote | 30 | 70 (code) / unverified device |
| Tablet check-in | 35 | 45 |
| Landscape | 40 | 48 |
| Desktop operator | 50 | 74 |
| **Overall** | **39** | **59** |

Code intent ≠ certified matrix. Anything marked **MANUAL ACCEPTANCE REQUIRED** blocks EO-003 completion.
