# EO-003 BEFORE / AFTER Delta

**Date:** 2026-08-08  
**Screenshot dirs:** `BEFORE/` partial · `AFTER/` **empty** (populate before visual sign-off)

## Score delta (from `01-UIX-AUDIT.md`)

| Screen | BEFORE | AFTER | Δ |
|--------|-------:|------:|--:|
| Login | 48 | 62 | +14 |
| Dashboard | 42 | 72 | +30 |
| Check-in | 45 | 65 | +20 |
| Lobby | 48 | 68 | +20 |
| Operator room | 40 | 74 | +34 |
| Owner room | 38 | 72 | +34 |
| Voting | 44 | 76 | +32 |
| Projector | 42 | 70 | +28 |
| Minutes / Evidence | 35 | 42 | +7 |
| Reconnect | 50 | 64 | +14 |

## Capability delta

| Theme | BEFORE (inventory) | AFTER (this session) |
|-------|--------------------|----------------------|
| Design tokens | Soft / inconsistent | **V2** semantic surfaces/text/status/assembly |
| Role chrome leak | Operator saw “Pedir la palabra” | **Fixed** owner-only + `applyRoleChrome` |
| Control hierarchy | End ≈ Pause | **Danger End** separated; ghost meta |
| Adaptive room | None | `data-voting` / `data-priority` |
| Voting ceremony | Weak confirm | SELECT → Review → dialog → receipt + human errors |
| Owner mobile vote | Not sticky | Sticky panel **intended** |
| Quorum | Static chip | Animation + required label |
| Speakers | Flat list | Numbered + wait times |
| Empty states | Large / vague | WHAT/WHY/NEXT + compact motion |
| LiveKit copy | English technical | Spanish human (AV still blocked) |
| Dashboard CTA | Below fold / readiness faux-CTA | Above fold; readiness demoted |
| Projector type | Weak distance | Distance typography |
| Header | Clipped into stage | Auto-height / min-height |
| Minutes/Evidence | Raw | Still largely raw |
| Participant drawer | Missing | Still missing |
| 8-browser / stress | Missing | Still **NOT EXECUTED** |

## Visual file delta

| Artifact | Status |
|----------|--------|
| BEFORE PNGs | 5 files (login×2, dashboard, check-in, lobby) |
| AFTER PNGs | **0 — needs population** |
| Side-by-side image review | **NOT EXECUTED** |

When `AFTER/` is populated, append image pairs here; until then score/capability tables are the authoritative delta.
