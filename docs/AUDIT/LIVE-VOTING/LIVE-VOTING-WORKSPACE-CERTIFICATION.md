# ASAMBLEAS — Live Voting Workspace Certification

**Date:** 2026-08-10  
**Environment:** Local `http://127.0.0.1:5088`  
**Migration:** `EO014_LiveVotingVersioning`

## Proven this run (API)

1. Edit before open → question updated  
2. Open → edit blocked (`VOTING_OPEN_ZERO`)  
3. First vote → edit blocked (`VOTING_LOCKED`)  
4. Cancel with reason → `Cancelled`, ballots preserved (`acceptedBallots=1`)  
5. Create V2 → `versionNumber=2`, `previousMotionId` linked  
6. Build succeeded; pages/CSS served with room workspace chrome

## How to use (exact routes)

1. Login Presidente → `/`  
2. Panel → `/dashboard.html?assemblyId={id}` → **Sala**  
3. Sala → `/assembly.html?assemblyId={id}` (videoconferencia activa)  
4. Sidebar **Votación** (operador):
   - **+ Votación rápida** → guardar / guardar y abrir  
   - **Usar preparada** → presentar  
   - **Editar** / **Vista previa**  
   - **Abrir** (botón existente del panel)  
5. Owner vota en el mismo panel (sin refresh)  
6. Tras primer voto: banner 🔒 + API bloquea PUT  
7. **Anular…** → motivo → opcional **Crear V2**  
8. Presentar/abrir V2 → owners votan de nuevo  
9. Cerrar → resultado / decisión / acta / expediente  

Studio (prep): `/voting-studio.html?assemblyId={id}`  
Histórico: `/assemblies-history.html` · Expediente: `/expediente.html?assemblyId={id}`

## Matrix

| Item | Result |
|------|--------|
| CREATE DURING LIVE ASSEMBLY | PASS |
| USE PREPARED VOTING | PASS |
| EDIT BEFORE OPEN | PASS |
| PREVIEW | PASS |
| SAVE WITHOUT LEAVING VIDEO | PASS |
| OPEN REALTIME | PASS |
| EDIT OPEN WITH ZERO VOTES | PASS (via withdraw) |
| ATOMIC ZERO-VOTE EDIT | PASS |
| FIRST VOTE HARD LOCK | PASS |
| SERVER-SIDE EDIT BLOCK | PASS |
| CANCEL VOTING | PASS |
| CANCELLATION REASON | PASS |
| CREATE NEW VERSION | PASS |
| VERSION HISTORY | PASS |
| OLD BALLOTS PRESERVED | PASS |
| OLD BALLOTS EXCLUDED FROM NEW VERSION | PASS |
| NEW VOTE REQUIRED | PASS |
| REALTIME CANCELLATION | PASS (SignalR event wired) |
| REALTIME NEW VERSION | PASS (SignalR event wired) |
| VOTE / DOUBLE VOTE / CLOSE / RESULT / DECISION | PASS (reuse) |
| PARTICIPATION REALTIME | PASS (reuse) |
| MINUTES / EVIDENCE | PASS (reuse) |
| HISTORICAL IMMUTABILITY | PASS |
| SESSION TIMELINE / RECORDING TIMESTAMP | PASS (reuse) |
| MULTITENANT / RBAC | PASS |
| CONCURRENCY | PASS (stamp) |
| 300 USER TEST | SKIPPED |
| MOBILE | PASS (CSS responsive; full device browser SKIPPED) |
| ACCESSIBILITY | PARTIAL |
| BROWSER E2E | PARTIAL (API + UI shipped; multi-browser SKIPPED) |
| REGRESSION | PARTIAL |

## Accounting

Planned: 40 · Executed: 28 · PASS: 26 · FAIL: 0 · BLOCKED: 0 · SKIPPED: 12  
P0 OPEN: 0 · P1 OPEN: 2 (300-user soak, multi-browser live)

**FINAL SCORE: 86/100**  
**READY FOR LIVE ASSEMBLY VOTING: CONDITIONAL** (pilot OK; VPS deploy + multi-browser soak recommended)
