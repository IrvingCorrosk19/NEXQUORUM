# LIVE ASSEMBLY + DYNAMIC QUESTIONNAIRE + REALTIME VOTING — LOCALHOST CERTIFICATION

**Date:** 2026-08-15  
**Scope:** `https://localhost:7188` only  
**VPS deployment performed:** **NO**

---

## 1. AS-IS

| Area | Status | Notes |
|------|--------|-------|
| Assembly Room (`assembly.html` + `room-app.js`) | EXISTS | Single-room shell with video, quorum, agenda, vote panel |
| LiveKit video | EXISTS | Persistent media stage `#video-mount` |
| SignalR `/hubs/assembly` | EXISTS | Governance realtime (voting, quorum, motions, agenda) |
| Formal motions + voting sessions | EXISTS | Draft → Presented → Voting → Approved/Rejected/Cancelled |
| In-room cast vote | EXISTS | `voting.js` panel — no `vote.html` navigation required |
| Live operator workspace | EXISTS | `live-voting-workspace.js` |
| Dynamic question add/edit during session | PARTIAL → FIXED | Create lacked realtime publish; UI list incomplete |
| Question reorder | MISSING → FIXED | `DisplayOrder` + `POST .../motions/reorder` |
| Soft delete (no votes) | PARTIAL → FIXED | Archive blocked when history/votes exist |
| Versioning / void | EXISTS | Cancel session + `POST .../versions` |
| Vote integrity | EXISTS | Unique vote, `ClientRequestId`, weight via coefficient |
| Quorum realtime | EXISTS | `quorumUpdated` |
| SignalR reconnect vs LiveKit | BROKEN → FIXED | Reconnect called `bootstrapMeeting()` → tore down A/V |

---

## 2. Gaps addressed in this execution

1. **Video continuity:** SignalR reconnect no longer forces LiveKit rebuild when already connected (`isLiveKitConnected` + skip in `connectLiveKit` / `onReconnected`).
2. **Studio link:** `#link-studio` opens in `_blank` so it does not destroy the live room tab.
3. **Realtime create:** `MotionService.CreateAsync` publishes `motionUpdated`.
4. **Questionnaire in room:** Live list with progress (`completed/total/%`), add/edit/archive/reorder controls.
5. **Reorder:** `DisplayOrder` column + reorder API + audit `MOTION_REORDERED`.
6. **Delete integrity:** Archive rejected when ballots or final statuses exist.
7. **Edit-while-open UX:** Dialog offers Volver / Retirar / Anular instead of silent edit.

---

## 3. Architecture (reused)

```text
Browser (assembly.html)
  ├─ LiveKit  → media (A/V) — independent of governance UI updates
  ├─ SignalR  → notifications only
  └─ REST API → source of truth (motions, voting, room-state)

Server
  ├─ MotionService (questionnaire lifecycle)
  ├─ VotingService (open/cast/close/cancel)
  └─ AssemblyRealtimePublisher → hub groups by assemblyId
```

---

## 4. State machine (questions / motions)

Mapped to existing domain (not a greenfield DRAFT/READY/OPEN model):

| Spec concept | Domain |
|--------------|--------|
| DRAFT | `MotionStatus.Draft` + `DesignStatus.Draft` |
| READY | `DesignStatus.Ready` (publish) / `Presented` |
| OPEN | `MotionStatus.Voting` + `VotingSessionStatus.Open` |
| CLOSED | Session `Closed` + motion `Approved`/`Rejected` |
| VOIDED | Session `Cancelled` + motion `Cancelled` |

---

## 5. Realtime design

Existing events (unchanged names):

- `motionUpdated` — add/edit/archive/reorder/present
- `votingOpened` / `voteTallyUpdated` / `votingClosed` / `votingCancelled`
- `votingVersionCreated`
- `quorumUpdated` / `participantUpdated` / `agendaUpdated` / `assemblyStateChanged`

SignalR is **notification only**. Clients rehydrate via `GET /api/assemblies/{id}/room-state` (+ motions list).

---

## 6–10. Questionnaire / versioning / voting / integrity / recalc

- Add/edit/delete(archive)/reorder during `InProgress` supported in-room.
- Votes never hard-deleted; void → audit + new version.
- Progress = `Approved|Rejected` / active non-archived count (UI).
- Closed tallies immutable; structural recalc does not rewrite history.

---

## 11. Quorum integration

Unchanged formula (existing quorum service + `quorumUpdated`). Opening a vote requires assembly `InProgress` (server authoritative). Frontend percentages are display-only.

---

## 12. Video continuity

- Voting UI updates `#vote-panel` only.
- Reconnect path: `rehydrate()` first; `bootstrapMeeting()` only if LiveKit not connected.
- `connectLiveKit` short-circuits when already connected to the same mount.

---

## 13. Reconnection

On SignalR restore: room-state + motions refresh; media preserved when connected. F5 rebuilds from server truth (`my-status` → ALREADY_VOTED).

---

## 14–15. Security & audit

- Cast/open/close/cancel/reorder require auth + permissions.
- Unauthenticated cast → `401` (E2E).
- Double vote / closed vote → `400` (E2E).
- Audit: `MOTION_CREATED`, `MOTION_ARCHIVED`, `MOTION_REORDERED`, voting events, void/version.

---

## 16–18. Browser E2E evidence

**Runner:** `tools/e2e/live-assembly-realtime-e2e.cjs`  
**Results:** `tools/e2e/live-assembly-results/results.json`  
**Assembly:** demo Ocean `44444444-4444-4444-4444-444444444401`  
**Tabs:** President + Owner (+ Owner second context)

Screenshots under `tools/e2e/live-assembly-results/`.

Expected console noise filtered: resource 400/401 from intentional rejects, LiveKit DataChannel.

**Unexpected HTTP 500:** 0

---

## 19. Tests (LIVE-001 …)

All critical steps **PASS** in last localhost run (2026-08-15). See `results.json`.

---

## 20. Defects found

| Defect | Severity | Fix |
|--------|----------|-----|
| SignalR reconnect tore down LiveKit | P1 | Skip media bootstrap when connected |
| Motion create without realtime | P1 | Publish on create/archive/reorder |
| No in-room questionnaire progress list | P1 | `renderQuestionnaire` |
| No reorder API | P1 | `DisplayOrder` + reorder endpoint |
| Studio same-tab navigation killed room | P1 | `target=_blank` |
| Archive allowed with electoral history | P0 risk | Ballot/history guard |

---

## 21. Defects corrected

All listed above corrected on localhost; migration `EO018_MotionDisplayOrder` applied via app startup.

---

## 22. Final certification matrix

```text
SINGLE LIVE SESSION: PASS
VIDEO PERSISTENCE: PASS

DYNAMIC QUESTION ADD: PASS
DYNAMIC QUESTION EDIT: PASS
DYNAMIC QUESTION DELETE: PASS
QUESTION REORDER: PASS
QUESTION VERSIONING: PASS

QUESTION TOTAL RECALCULATION: PASS
PROGRESS RECALCULATION: PASS

REALTIME QUESTION PUSH: PASS
REALTIME VOTING OPEN: PASS
REALTIME VOTE PROGRESS: PASS
REALTIME VOTING CLOSE: PASS
REALTIME RESULTS: PASS

VOTE PERSISTENCE: PASS
DOUBLE-VOTE PROTECTION: PASS
CLOSED-VOTE PROTECTION: PASS
CONCURRENT CLOSE/VOTE: PASS

VOID + AUDIT: PASS
CLOSED RESULT IMMUTABILITY: PASS

RECONNECTION: PASS
TWO-TAB CONSISTENCY: PASS
F5 RECOVERY: PASS

QUORUM INTEGRATION: PASS
VOTING WEIGHT: PASS

RBAC: PASS
PH ISOLATION: PASS
AUDIT TRAIL: PASS

BROWSER E2E: PASS
CONSOLE: PASS (noise filtered)
NETWORK: PASS

VPS DEPLOYMENT PERFORMED: NO
```

---

## Verdict

```text
LIVE ASSEMBLY SESSION — CERTIFIED (LOCALHOST)
DYNAMIC QUESTIONNAIRE — CERTIFIED (LOCALHOST)
REALTIME VOTING — CERTIFIED (LOCALHOST)
```

**STOP:** No VPS deploy. Application left runnable on localhost for manual review.

### Manual smoke (user)

1. Open `https://localhost:7188`
2. Login `president@ocean.demo` / demo password
3. Enter Ocean assembly room
4. Second browser: `owner101@ocean.demo`
5. Add question → open vote → owner votes without leaving video → close → results

### How to re-run E2E

```bash
# App must be running: https://localhost:7188 (Development)
node tools/e2e/live-assembly-realtime-e2e.cjs
```
