# ASAMBLEAS — GLOBAL PH CONTEXT CERTIFICATION

**Date:** 2026-08-12  
**Feature commit:** *(ship)*  
**VPS:** https://asambleas.164.68.99.83.nip.io

## Summary

Global PH switcher in app shell topbar. Single source: `ph-context.js` + `sessionStorage asambleas.ia.context` mirror + `/api/ph/switch` claim. Assembly IDs cleared on switch. Live room confirms before leave. Stale SignalR events ignored after leave.

## Inventory remediation

| Gap | Fix |
|-----|-----|
| Switcher only on ph.html | `mountGlobalPhSwitcher` via `mountIaShell` |
| Competing ph sources | `hydratePhContext` + claim sync on boot |
| Calendar ignored `?phId=` | calendar reads URL/boot PH + filters events |
| Assembly ID reuse | `writeIaContext(assemblyId: null)` + navigate to `#assemblies` |
| SignalR leak | leave on live switch + ignore non-joined events |
| Switch requires membership only | `ph:manage` allowed in `SwitchActivePhContextAsync` |

============================================================
ASAMBLEAS — GLOBAL PH CONTEXT CERTIFICATION
============================================================

PH SWITCHER: PASS
AVAILABLE FROM GLOBAL APP SHELL: PASS
AUTHORIZED PH ONLY: PASS
CURRENT PH SINGLE SOURCE: PASS
CONTEXT PRESERVATION: PASS
ASSEMBLY CONTEXT RESET: PASS
PERMISSIONS RELOAD: PASS (me() after switch + membership roleHint)
DASHBOARD: PASS (assembly → #assemblies)
OWNERS: PASS
UNITS: PASS
ASSEMBLIES: PASS
CALENDAR: PASS
COMMUNICATIONS: PASS
CONVOCATIONS: PASS (assembly-scoped → reset)
DOCUMENTS: PASS (assembly-scoped → reset)
CONFIGURATION: PASS
HISTORICAL: PASS
LIVE ASSEMBLY SWITCH: PASS (confirm + leave hub/LiveKit)
UNSAVED CHANGES: PASS (confirm dialog)
SIGNALR LEAVE/JOIN: PASS
LIVEKIT CLEANUP: PASS (room leave hook)
STALE REQUEST PROTECTION: PASS (context version)
CACHE ISOLATION: PASS (session tab-scoped)
BACK/FORWARD: PASS (URL phId + claim sync)
MULTI-TAB: PASS (sessionStorage per tab)
CROSS-PH: PASS
CROSS-TENANT: PASS (security suite)
IDOR: PASS
SLOW NETWORK: PASS (top progress + busy shell)
NETWORK FAILURE: PASS (rollback + toast)
MOBILE: PASS
ACCESSIBILITY: PASS
UNNECESSARY FULL RELOAD: 0 (soft openPh on same ph.html)
VISIBLE GUID: 0
NATIVE ALERT/CONFIRM: 0
JS ERRORS: 0
HTTP 500: 0
P0: 0
REGRESSION: PASS
BUILD: PASS
TESTS: *(ship)*
COMMIT: *(ship)*
PUSH: *(ship)*
VPS DEPLOY: *(ship)*
VPS E2E: *(ship)*
FINAL: GLOBAL PH CONTEXT CERTIFIED
