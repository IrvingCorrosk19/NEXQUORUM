# ASSEMBLY STATE BEHAVIOR MATRIX

**Audit date:** 2026-08-12  
**Legend:** ALLOW | READ | DENY | N/A | **GAP** (expected DENY/READ but observed weaker)

Statuses = domain: Draft | Scheduled | CheckIn | InProgress | Paused | Completed | Cancelled  
(“Finalized” = Completed. There is no Closed≠Completed.)

---

## Primary function × status

| Función | Draft | Scheduled | CheckIn | InProgress | Paused | Completed | Cancelled |
|---------|-------|-----------|---------|------------|--------|-----------|-----------|
| Editar asamblea (detalles) | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| Eliminar hard | N/A* | N/A* | DENY† | DENY† | DENY† | DENY† | N/A* |
| Cancelar | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | N/A |
| Reprogramar | ALLOW | ALLOW | ALLOW | DENY | DENY | DENY | DENY |
| Convocar / reenviar | ALLOW‡ | ALLOW‡ | ALLOW‡ | ALLOW‡ **GAP** | ALLOW‡ **GAP** | ALLOW‡ **GAP** | ALLOW‡ **GAP** |
| Abrir acreditación (start-checkin) | DENY | ALLOW | N/A | N/A | N/A | DENY | DENY |
| Acreditar / check-in | DENY | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Entrar sala (LiveKit token) | DENY | ALLOW§ | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Abrir lobby/assembly UI | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | **GAP** (loads) | **GAP** |
| Mic / cámara LiveKit | DENY | ALLOW§ | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Pedir palabra | DENY | DENY | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Grant speaker (ops) | — | — | — | — | — | **GAP** (no status) | **GAP** |
| Crear / editar votación (draft motion) | ALLOW¶ | ALLOW¶ | ALLOW¶ | ALLOW¶ | ALLOW¶ | DENY create / **GAP** update | DENY create |
| Abrir votación | DENY | DENY | DENY | ALLOW | DENY | DENY | DENY |
| Votar | DENY | DENY | DENY# | ALLOW# | ALLOW# | DENY | DENY |
| Cerrar votación | — | — | — | ALLOW | ALLOW | N/A (must be closed first) | — |
| Ver resultados | READ | READ | READ | READ | READ | READ | READ |
| Editar agenda | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | DENY | DENY |
| Generar / ver acta | READ | READ | READ | READ | READ | READ | READ |
| Editar acta | N/A (no write API) | same | same | same | same | N/A | N/A |
| Start recording | **GAP** | **GAP** | **GAP** | ALLOW intent | ALLOW intent | **GAP** | **GAP** |
| Ver / descargar grabación | READ†† | READ†† | READ†† | READ†† | READ†† | READ†† | READ†† |
| SignalR Join → presence | **GAP** | **GAP** | ALLOW | ALLOW | ALLOW | **GAP P0** | **GAP** |
| Quorum append snapshot | via ops | via ops | ALLOW | ALLOW | ALLOW | **GAP P0** | **GAP** |
| CTA primario UI (PH list) | Ver asamblea | Ver asamblea | Entrar | Entrar | Entrar | Ver resultados | Ver resultados |
| Nav tab “Sala” | shown | shown | primary | primary | primary | **more (GAP)** | **more (GAP)** |

\* Hard delete of assemblies is constrained by PH purge rules (legal history).  
† Completed/InProgress/CheckIn/Paused block PH hard-delete when present.  
‡ `ConvocationService.ResendAsync` has **no assembly status gate** (code).  
§ Scheduled can obtain LiveKit token (pre-live join window / product intent unclear).  
¶ Motions: create blocked on Completed/Cancelled; update weaker.  
# Vote requires accredited + session Open; Open only when InProgress.  
†† Subject to `recording:view` / download permissions.

---

## Expected historical mode (product) vs current

| Expected when Completed | Current |
|-------------------------|---------|
| No “Entrar a sala” as live CTA | **Mostly PASS** — primary CTA → minutes/results |
| No Sala in operational nav | **FAIL** — `ia-nav.js` keeps Sala under “more” |
| Direct URL → historical / 403 | **PARTIAL** — pages load; LiveKit DENY |
| No mic/cam/check-in/vote/quorum mutate | Vote/check-in/token **PASS**; presence/quorum/recording **FAIL** |
| Banner “modo consulta” | **MISSING** — no dedicated historical banner found |
| Seal acta | **MISSING** — hash regenerated from live package |

---

## CTA engine reference (backend)

`AssemblyRoomRules` / `AssemblyPrimaryCtas`:

| Status | Primary CTA key |
|--------|-----------------|
| Draft | Prepare |
| Scheduled | StartCheckIn |
| CheckIn | StartAssembly |
| InProgress / Paused | Continue |
| Completed / Cancelled | ViewResults |

UI (`ia-actions.js`, `ph-app.js`) largely aligns for primary buttons; secondary/nav/menus diverge (Reprogramar/Convocatoria/Sala still offered on finished rows in PH list overflow).
