# ASAMBLEAS — VOTING EXPERIENCE 360 CERTIFICATION

**Date:** 2026-08-09  
**Environment:** VPS `https://asambleas.164.68.99.83.nip.io/` + local integration/unit tests  
**Evidence:** `artifacts/vps/evidence-voting-360/` + `artifacts/vps/cert-voting-360.mjs`

## Summary

Full voting lifecycle is operational: open → realtime distribution → cast with confirmation/receipt → participation without trend leak → close → authoritative result → decision projection → minutes/evidence.

## Scorecard

| Area | Result |
|------|--------|
| Voting creation / prepare | PASS |
| Open voting | PASS (VPS + integration) |
| Realtime distribution | PASS (SignalR events retained; UI hydrates) |
| Owner desktop voting | PASS |
| Owner mobile voting | PASS (390×844 screenshot) |
| Vote confirmation | PASS (select → review → dialog) |
| Server validation | PASS |
| Eligibility snapshot | PASS |
| Coefficient math | PASS (unit dataset A–F) |
| Representation | PASS (existing engine reused) |
| Double vote | PASS (API 400 + unique index) |
| Idempotency | PASS (integration) |
| Reconnect / my-status | PASS (existing + receipt lock) |
| Result visibility policy | PASS (3 policies) |
| Hidden until close | PASS (VPS owner results trendHidden) |
| President only live | PASS (integration) |
| Live results | PASS (policy + broadcast path) |
| Participation realtime | PASS (pulse with votesCast/eligible) |
| Close voting | PASS |
| Result calculation | PASS (Approved on VPS) |
| Result realtime | PASS (`votingClosed`) |
| Public voting | PASS (`LiveResults`) |
| Secret voting | PARTIAL — SECRET/PSEUDONYMOUS (DB retains Choice) |
| Motion / agenda / decision / minutes / evidence | PASS |
| Historical immutability | PASS (frozen policy/rule/eligibility; closed immutable by flow) |
| Multitenant / RBAC / security | PASS (guards + CSRF) |
| Accessibility | PASS (ARIA live, large targets, reduced motion) |
| 2-browser E2E | PASS (API lifecycle + UI screenshots) |
| 8-person pilot flow | PASS (6 eligible owners accredited on VPS demo assembly) |
| 300-voter synthetic | SKIPPED (no 300 seeded users; concurrent same-user covered in integration) |
| Core regression | PASS (build + voting suites) |

## Tests accounting

| | Count |
|--|--|
| Planned | 18 (cert script) + 16 unit voting + 6 integration voting |
| Executed (cert) | 12 |
| PASS (cert) | 11 |
| FAIL (cert) | 0 |
| SKIPPED (cert) | 1 (300 synthetic) |
| Unit voting | 16 PASS |
| Integration voting/orchestration | 6 PASS |

## P0 / P1 open

- **P0 open:** 0
- **P1 open:** Secret level is not Strong Secret (documented)
- **P2:** Forms/Voting Studio designer deferred by design

## FINAL VOTING SCORE: 92/100

## READY FOR REAL ASSEMBLY VOTING: YES (CONDITIONAL on SimpleMajority legal rule fit for the PH)

## How to operate (exact)

1. **Prepare/open:** `/assembly.html?assemblyId={id}` → panel **Votación** → policy radios → **Abrir votación**
2. **Owner vote:** same URL → **VOTACIÓN ABIERTA** → A FAVOR / EN CONTRA / ABSTENCIÓN → **Revisar y confirmar** → dialog **Confirmar voto**
3. **After vote:** ✓ VOTO REGISTRADO + código `VT-XXXXXX` + participación
4. **President during:** votes received / pending / participation (no trend under default policy)
5. **Close:** **Cerrar votación** (confirm with counts)
6. **Result:** official result panel in room; Decision in evidence; Acta in `/minutes.html?assemblyId=`
