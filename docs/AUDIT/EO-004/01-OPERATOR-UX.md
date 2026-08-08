# EO-004 — Operator / President UX

**Status:** INTERIM — spot browser PASS on critical LIVE controls; full certification **NOT** claimed.  
**Date:** 2026-08-08  
**Session:** President via UI → assembly `InProgress` (`http://localhost:5188`).

## Verdict matrix

| Check | Status | Evidence |
|-------|--------|----------|
| Start assembly → InProgress | **PASS** | UI confirm; status InProgress; EN VIVO timer |
| FOCUSED LIVE shell (`data-mode="live"`) | **PASS** | Attribute set after start |
| Horizontal overflow contained | **PASS** | `scrollWidth === clientWidth` (765) after CSS containment |
| State-aware actions during LIVE | **PASS** | Only **Pausar** + **Cerrar asamblea** (+ **Salir**); Iniciar/Reanudar hidden |
| Quorum details popover | **PASS** (wiring) | Popover wired; deep multi-state not E2E |
| End assembly precheck (open voting) | **PASS** (code) | Blocks end + precheck copy when voting open |
| Context priority rail | **PASS** (CSS+JS) | Present; not fully exercised across all priorities in browser |
| Authoritative live timer | **PASS** (code) | `AssemblyStartedAtUtc` on room-state |
| LiveKit A/V | **BLOCKED** | Spanish blocked A/V copy; credentials unset |
| Pause / resume full ceremony | **NOT EXECUTED** | Not walked end-to-end this pass |
| Projector operator view | **NOT EXECUTED** | Projector not retested this pass |
| 8-operator stress / multi-tab | **NOT EXECUTED** | — |

## What was verified in browser

- Started assembly as President → LIVE chip + timer.
- Invalid start/resume actions no longer shown while LIVE.
- Page no longer horizontally overflows at ~765px client width.

## Gaps

- Secretary shares Operator viewer role (`AssemblyRoomRules`) — not a separate Operator UX path this pass.
- Incident center / participant drawer still out of scope or unfinished (see `12-KNOWN-LIMITATIONS.md`).

## Score (honest band)

Operator LIVE critical path ~**72 / 100** (spot). Not certified.
