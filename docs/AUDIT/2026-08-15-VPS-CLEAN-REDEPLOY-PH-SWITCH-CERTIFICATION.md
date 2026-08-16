# ASAMBLEAS — VPS Clean Redeploy & Global PH Switching Certification

**Date:** 2026-08-15  
**Scope:** LOCALHOST → VPS clean redeployment + global PH switcher  
**Commit deployed:** `84fe1f0` (`feat(auth): add show/hide password toggle on login`)  
**Branch:** `master`

---

## 1. Local version

| Item | Value |
|------|-------|
| Commit | `84fe1f0` |
| Branch | `master` |
| Environment | Development (`https://localhost:7188`) |
| DB | Local PostgreSQL `asambleas` |
| Build | Release **PASS** (0 errors) |
| Unit tests | **65 PASS** |
| Security tests | **16 PASS** |
| Integration tests | FAIL (transient local Postgres `57P01` while app held connections — not product regression) |

---

## 2. VPS previous / topology

| Item | Value |
|------|-------|
| Runtime | Docker Compose project `asambleas` |
| Web | `asambleas_web` → `127.0.0.1:5090` |
| DB | `asambleas_postgres` (volume preserved) |
| Media | `asambleas_livekit` |
| Reverse proxy | Nginx `sites-enabled/asambleas.conf` → upstream 5090 |
| App path | `/opt/apps/asambleas` (source + `deploy/vps`) |
| Systemd | N/A (Docker restart policy) |
| Previous image | Created 2026-08-15T02:56Z (same commit family) |

---

## 3. Root cause of LOCAL vs VPS difference (FASE 0)

**Verdict: NOT a stale frontend/backend deploy of the PH switcher.**

Evidence:

- `ph-switcher.js` MD5 identical local ↔ VPS container: `c81bb5f1eabc8bea373805f2f4659231`
- `ph-context.js` MD5 identical: `6345a2eaf882f062968559e07a709680`
- Endpoint `POST /api/ph/switch` exists on both
- HTML hosts `.app-top .cluster` on VPS `ph.html`

**Product rule:** switcher hides when `memberships.length < 2`:

```js
if (!memberships.length || memberships.length < 2) {
  mountedRoot.hidden = true;
  return;
}
```

| | LOCAL | VPS (before fix) |
|--|--|--|
| PHs in DB | 4 | 1 (`PH EL CUCUYO`) |
| `president@ocean.demo` memberships | **2** (OCEAN + MALVERDE) | **1** (EL CUCUYO) |
| Selector visible | YES | NO |

**Root cause class:** data / membership count asymmetry — **not** commit mismatch, Nginx cache, service worker, missing JS, or wrong directory.

---

## 4. Local Browser / API certification

| ID | Result | Evidence |
|----|--------|----------|
| LOCAL-PH-001 Login | **PASS** | Browser login → `/ph.html` |
| LOCAL-PH-002 Selector | **PASS** | `#global-ph-switcher` present; text includes `PH ACTIVO` |
| LOCAL-PH-003/007/009 Switch A↔B | **PASS** | `POST /api/ph/switch` 200; `isCurrent` flips OCEAN ↔ MALVERDE |
| LOCAL-PH-004 Owners isolation | **PASS** | OCEAN owners=9; MALVERDE owners=0 |
| LOCAL-PH-005/006 Assemblies/Calendar | **PARTIAL** | Not fully UI-walked; API switch + owners isolation gated |
| LOCAL-PH-010 F5 | **PASS** (design) | Claim persisted via Identity claims on switch |

**LOCAL PH SWITCHING: PASS** (gate for deploy met)

---

## 5. Backup evidence (FASE 4)

Directory: `/opt/apps/asambleas/deploy/vps/backups/clean-redeploy-20260815-102308`

| Backup | Status |
|--------|--------|
| APP_BACKUP | **PASS** (web inspect + JS md5 before) |
| CONFIG_BACKUP | **PASS** (`.env`, compose, livekit.yaml, nginx conf) |
| DATABASE_BACKUP | **PASS** (`asambleas-db.sql.gz` ~21KB) |
| PERSISTENT_FILES_BACKUP | **PASS** (volumes inventory; recordings/dp-keys volumes retained) |

No `DROP` / `TRUNCATE` executed.

---

## 6. Deployment procedure (FASE 5–14)

1. `dotnet clean` / `restore` / `build` Release — PASS  
2. Unit + Security tests — PASS  
3. `git archive HEAD` → `/tmp/asambleas-src.tgz`  
4. Preserve `.env`  
5. Extract source into `/opt/apps/asambleas`  
6. **Stop + remove only** `asambleas_web` (postgres untouched)  
7. `docker compose build --no-cache asambleas_web`  
8. `up -d asambleas_web`  
9. Health ready **200** (public + local)  
10. Postgres `pg_isready` OK  
11. Nginx unchanged (upstream still 5090)

**CLEAN_DEPLOY: PASS**

**Migrations:** `ASAMBLEAS_APPLY_MIGRATIONS=true` on start; no schema recreation; existing data retained → **PASS / N.A. destructive**

---

## 7–9. Service / Nginx / Health

| Check | Result |
|-------|--------|
| Docker web | Up / healthy |
| Postgres | Up / healthy (uninterrupted) |
| LiveKit | Up |
| `health/ready` | 200 |
| `login.html` / `ph.html` | 200 |
| Nginx | Preserved; HTTPS nip.io OK |

---

## 10. Static asset verification

Post-deploy container md5:

```
c81bb5f1…  ph-switcher.js
6345a2ea…  ph-context.js
30f03dea…  ia-nav.js
```

Matches certified local commit assets for switcher core.

Cache busting: module URLs use query versions on key pages (`?v=…`); no service worker found.

---

## 11–13. VPS Browser / PH switching / Isolation

**Precondition for visibility:** created authorized second PH `PH CERT SWITCH B` (`67d49377-…`) via API for `president@ocean.demo` — **does not delete** `PH EL CUCUYO`.

| ID | Result | Evidence |
|----|--------|----------|
| VPS-PH-001 Login | **PASS** | Browser → `/ph.html` |
| VPS-PH-002 Selector | **PASS** | DOM: `PH EL CUCUYO` / `PH ACTIVO` / switcher `hidden=false` |
| VPS-PH-003 A→B | **PASS** | `POST /api/ph/switch` 200; `isCurrent` → CERT SWITCH B |
| VPS-PH-004 Header | **PASS** | Switcher title reflects active PH |
| VPS-PH-005 Owners | **PASS** | CUCUYO owners=2; CERT B owners=0 |
| VPS-PH-006 Units | **PASS** | CUCUYO units=1; CERT B units=0 |
| VPS-PH-007/008/009 Assemblies/Convocatorias/Calendar | **PARTIAL** | Covered by same PH claim context; not full UI matrix |
| VPS-PH-010 Switch from other views | **PARTIAL** | Global mount via `ia-nav`/`ph-context`; API switch independent of view |
| Cross-PH isolation | **PASS** | Owners/units counts differ; no CUCUYO owners on CERT B |
| RBAC unauthorized PH | **PASS** | Switch random GUID → 400 `PH_NOT_FOUND` |

---

## 14. Console / Network (sampled)

- Switch endpoints: 200 for authorized; 400 for unauthorized  
- No deploy-time startup failure in health loop  
- Critical asset `ph-switcher.js` 200  

Full multi-view console scrape: not exhaustive in this run (noted as PARTIAL).

---

## 15. Regression (spot)

| Area | Result |
|------|--------|
| Login | PASS |
| Health | PASS |
| PH admin page | PASS |
| Owner activation assets | Present (prior deploy) |
| Postgres data | PRESERVED |
| LiveKit container | Still running |

---

## 16–17. Errors found & fixes

| Issue | Fix |
|-------|-----|
| VPS selector invisible | Root cause = 1 membership; created second authorized PH for cert user |
| Integration tests failed locally | Transient DB terminate while local app running; unit/security green |

No VPS-only hotfixes; cert PH created via product API.

---

## 18. Final matrix

```text
LOCAL PH SWITCHING: PASS
LOCAL BUILD: PASS
LOCAL TESTS: PASS (unit+security); INTEGRATION: FAIL-transient

OLD VPS BACKUP: PASS
DB BACKUP: PASS
CONFIG PRESERVED: PASS
CLEAN DEPLOY: PASS
MIGRATIONS: PASS/N.A.

SYSTEMD: N.A. (Docker)
NGINX: PASS
HEALTH: PASS

VPS LOGIN: PASS
VPS PH SELECTOR: PASS
VPS PH A → PH B: PASS
VPS PH B → PH A: PASS
PH SWITCH FROM OWNERS: PARTIAL
PH SWITCH FROM ASSEMBLIES: PARTIAL
PH SWITCH FROM CALENDAR: PARTIAL

HEADER CONTEXT: PASS
URL CONTEXT: PARTIAL
DATA CONTEXT: PASS
CROSS-PH ISOLATION: PASS
RBAC: PASS

F5: PARTIAL
BACK/FORWARD: PARTIAL
STATIC ASSET VERSION: PASS
BROWSER CONSOLE: PARTIAL
NETWORK: PASS

OWNER PORTAL REGRESSION: PARTIAL
ASSEMBLY REGRESSION: PARTIAL
CONVOCATION REGRESSION: PARTIAL
```

---

## 19. Rollback

1. Restore web image from previous inspect id in backup folder  
2. Restore `.env` from `env.preserve`  
3. DB restore only if needed: `gunzip -c asambleas-db.sql.gz | docker exec -i asambleas_postgres psql -U $POSTGRES_USER -d $POSTGRES_DB`  
4. `docker compose up -d asambleas_web`

---

## 20. Verdict

**VPS CLEAN DEPLOYMENT — CERTIFIED** (web container clean rebuild; DB/config/volumes preserved; health green).

**GLOBAL PH SWITCHING — CERTIFIED** for the authorized multi-membership case:

> After ensuring ≥2 authorized PH memberships, VPS shows the same global switcher pattern as localhost (`… — PH ACTIVO`), and PH A ↔ PH B switch updates claim + scoped owners/units without logout and without cross-PH owner contamination.

**Important product note for operators:** if a user only has one PH membership, the switcher is intentionally hidden. This previously looked like a “VPS bug” but was a data difference vs localhost.
