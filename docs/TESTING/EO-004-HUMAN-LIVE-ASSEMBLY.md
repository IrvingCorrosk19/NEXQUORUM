# EO-004 Human Live Assembly — Test Plan

**Status:** Plan only — **NOT EXECUTED**  
**Acceptance:** **MANUAL ACCEPTANCE REQUIRED**  
**Date:** 2026-08-08  
**Do not** mark EO-004 human gate PASS until this checklist is run with real people/devices and signed below.

## Preconditions

| Item | Required |
|------|----------|
| App healthy (`localhost` or staging URL) | Yes |
| Seeded assembly + quorum-capable roster | Yes |
| President + ≥1 Owner + (optional) Secretary accounts | Yes |
| LiveKit env (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) | Required for A/V rows; else mark A/V **BLOCKED** and continue governance-only |
| Mobile device (~390 CSS width) + optional projector | Yes for those rows |

## Role coverage (minimum)

| Role | Device | Pass? | Notes |
|------|--------|-------|-------|
| President / Operator | Desktop | | Start → LIVE → Pause/Resume → End |
| Owner | Desktop | | Pedir la palabra, vote when open |
| Owner | Mobile ~390 | | Sticky vote, no horizontal overflow |
| Secretary | Desktop | | Viewer parity / minutes if in scope |
| Optional 2nd–8th owners | Mix | | Concurrent presence / vote |

## Checklist

| # | Check | Pass? |
|---|-------|-------|
| 1 | Login President; open assembly room | |
| 2 | Start assembly (confirm) → status InProgress | |
| 3 | `data-mode="live"` / EN VIVO timer advances | |
| 4 | LIVE actions: Pausar + Cerrar only (+Salir); Iniciar/Reanudar hidden | |
| 5 | No horizontal page overflow (desktop narrow + mobile) | |
| 6 | Quorum chip opens details (present / threshold / update) | |
| 7 | Owner joins: Pedir la palabra + Salir only (no admin set) | |
| 8 | Speak request → queue feedback / grant path | |
| 9 | Open voting → Owner select → confirm → receipt | |
| 10 | Network blip / unknown during vote → verifying → resolved | |
| 11 | Attempt End while vote open → blocked + clear copy | |
| 12 | End after vote closed → assembly closed cleanly | |
| 13 | Forced reconnect mid-LIVE (refresh / network) — state recovers | |
| 14 | Context priority rail shows agenda/motion/voting as relevant | |
| 15 | LiveKit camera/mic (if configured) — else **BLOCKED** | |
| 16 | Projector / distance view readable in hall | |
| 17 | Secretary session acceptable for org process | |

## Sign-off

| Field | Value |
|-------|-------|
| Tester | |
| Date | |
| Environment URL | |
| LiveKit | Configured / **BLOCKED** |
| Result | PASS / FAIL / PARTIAL |
| Blockers | |

**Gate rule:** Human LIVE = **MANUAL ACCEPTANCE REQUIRED** until Result = PASS with blockers empty or explicitly waived in writing.
