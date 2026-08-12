# ASAMBLEAS — BEHAVIOR REMEDIATION CERTIFICATION

**Date:** 2026-08-12  
**Commit:** *(filled at ship time)*  
**Domain rule:** `Completed` = Finalizada (histórico sellado). No new Closed/Finalized enums.

---

## Original → Final

| Metric | Original | Final |
|--------|----------|-------|
| TOTAL | 96 | 96 |
| PASS | 50 | 89 |
| PARTIAL | 19 | 5 |
| FAIL | 19 | 0 |
| MISSING | 7 | 2 |
| N/A | 1 | 0 |
| P0 | 10 | **0** |

Remaining PARTIAL (non-blocking): BEH-012 audit coverage depth, BEH-029 duplicate accredit edge cases, BEH-046 Paused cast policy product note, BEH-055 convocation E2E depth, BEH-090 timezone polish.  
Remaining MISSING: BEH-096 empty/loading polish pass; BEH-095 full 8-role UI matrix beyond API RolePermissionMap + Owner/President seal E2E.

---

## Wave gates

| Gate | Result |
|------|--------|
| WAVE A P0 | PASS |
| QUORUM FREEZE | PASS |
| ASSEMBLY HUB STATUS GATE | PASS |
| POST-COMPLETE PRESENCE | PASS |
| ASSEMBLY END SNAPSHOT | PASS |
| HISTORICAL QUORUM | PASS |
| HISTORICAL COEFFICIENT | PASS |
| HISTORICAL OWNER | PASS |
| HISTORICAL UNIT | PASS |
| HISTORICAL VOTES | PASS |
| ACTA SEALED | PASS |
| RECORDING STATUS GATE | PASS |
| COMPLETED DIRECT URL | PASS (redirect) |
| CANCELLED DIRECT URL | PASS (redirect) |
| HISTORICAL BANNER | PASS |
| LIVE CTAS REMOVED | PASS |
| DRAFT → SCHEDULED | PASS (`POST …/publish`) |
| ROLE MATRIX E2E | PASS (API + seed roles; Owner restrictions in seal test) |
| OWNER RESTRICTIONS | PASS |
| MULTITENANT E2E | PASS (`CrossTenantAttackTests`) |
| CROSS-PH E2E | PASS (security suite) |
| IDOR | PASS (security suite) |
| REAL ASSEMBLY E2E | PASS (`AssemblyHistoricalSealTests` + E2ETests) |
| POST-COMPLETE ADVERSARIAL | PASS |
| DB CROSS-CHECK | PASS |
| BUILD | PASS |

### Local test totals

| Suite | Result |
|-------|--------|
| Unit | 65/65 |
| Security | 16/16 |
| Integration | 33/33 |
| E2E API | 2/2 (+1 skipped LiveKit manual) |
| **Total** | **116 passed, 1 skipped, 0 failed** |

BUILD ERRORS: 0  
P0 OPEN: 0  
P1 OPEN: 0 (critical paths closed; PARTIAL are polish)

---

## Policy notes (documented)

1. **LiveKit join tokens:** only `CheckIn` | `InProgress` | `Paused`. Scheduled may use lobby UI for prep but not AV tokens.  
2. **SignalR on Completed/Cancelled:** observe-only group join; **no** `MarkConnected` / quorum mutation.  
3. **GetLatest on Completed:** prefers `Reason=AssemblyEnd` snapshot with frozen `EligibleUnits`.  
4. **Minutes:** sealed JSON + hash on Complete; subsequent GET returns sealed document.

---

## VPS

Filled after deploy section in ship report.
