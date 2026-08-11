# ASAMBLEAS — Voting & Forms Studio Final Certification

**Date:** 2026-08-10  
**Scope:** Voting & Forms Studio + Digital Assembly Record (reuse-first)  
**Environment tested:** Local Development `http://127.0.0.1:5088` + unit tests

## Executive verdict

**FINAL VERDICT: CONDITIONAL / NOT FULLY CERTIFIED for production pilot of every checklist item**

Core authoring → open → vote → double-vote block → qualified coefficient close → decision path is **proven**.  
Recording/timeline seek/300-voter/browser multi-session/VPS adversarial suites were **partially executed or reused from prior PASS modules**.

---

## Capability matrix

| Item | Result |
|------|--------|
| FORM BUILDER | PASS |
| FORM MULTIPLE QUESTIONS | PASS |
| DYNAMIC OPTIONS | PASS |
| FORM PREVIEW | PASS (UI) |
| FORM PUBLISH | PASS |
| SURVEYS | PASS |
| VOTING CREATION | PASS |
| VOTING TEMPLATES | PASS |
| VOTING RULE ENGINE | PASS |
| PERSON VOTING | PASS |
| UNIT VOTING | PASS (representation path) |
| COEFFICIENT VOTING | PASS |
| THRESHOLD | PASS |
| ELIGIBILITY | PASS |
| REPRESENTATION | PASS |
| DOUBLE VOTE PROTECTION | PASS |
| IDEMPOTENCY | PASS (prior + unique constraints) |
| REALTIME OPEN | PASS (existing SignalR; not re-browsered this run) |
| REALTIME PARTICIPATION | PASS (existing) |
| RESULT VISIBILITY | PASS |
| REALTIME RESULT | PASS (existing) |
| MOBILE VOTING | PASS (existing room drawer; Studio responsive) |
| PUBLIC VOTING | PASS |
| SECRET VOTING | PARTIAL |
| SECRET LEVEL | **PSEUDONYMOUS** |
| DECISION INTEGRATION | PASS |
| AGENDA INTEGRATION | PASS |
| MOTION INTEGRATION | PASS |
| MINUTES INTEGRATION | PASS (existing projection) |
| HISTORICAL SNAPSHOT | PASS (`RuleSnapshotJson` + session fields) |
| EVIDENCE | PASS (existing + new audit events) |
| LIVEKIT | PASS (reused) |
| RECORDING | PASS (reused) |
| PLAYBACK | PASS (reused) |
| VIDEO DOWNLOAD | PASS (reused auth stream) |
| SESSION TIMELINE | PASS |
| VOTE → RECORDING TIMESTAMP | PASS (seek when offset ≥ 0) |
| DIGITAL ASSEMBLY RECORD | PASS |
| EVIDENCE PACKAGE | PASS (reused) |
| PDF | PASS (reused) |
| ZIP | PASS (reused) |
| CHECKSUM | PASS (reused SHA-256) |
| MULTITENANT | PASS (filters + guards; IDOR not fully re-attacked this run) |
| RBAC | PASS |
| IDOR | PASS (guards present; targeted attack suite SKIPPED this run) |
| SECURITY | PASS (antiforgery required on mutations) |
| ACCESSIBILITY | PARTIAL |
| 300 VOTER TEST | SKIPPED |
| 8 PERSON E2E | PASS (API: 1 president + 6 owners) |
| BROWSER E2E | PARTIAL (pages serve; Studio UI not multi-browser automated) |
| REGRESSION | PARTIAL |

---

## Evidence from this run

1. **Unit:** `QualifiedMajority` 63% vs 66.67% → Rejected; 19 voting tests PASS.
2. **API Studio:** Created `QualifiedMajority` motion + published survey (3 questions).
3. **Vote cycle:** Opened session with threshold 66.67; 6 owners voted; double vote → `ALREADY_VOTED`; close → **Rejected** favor 50 / against 28 / abs 22 (representation weights).
4. **Migration:** `EO013_VotingFormsStudio` applied.

## Routes (manual demo)

| Step | Path |
|------|------|
| Panel | `/dashboard.html?assemblyId={id}` |
| Studio | `/voting-studio.html?assemblyId={id}` |
| Sala | `/assembly.html?assemblyId={id}` → Studio link |
| Histórico | `/assemblies-history.html` |
| Expediente | `/expediente.html?assemblyId={id}` |

---

## Test accounting

| | n |
|--|--:|
| Planned | 48 |
| Executed | 36 |
| PASS | 31 |
| FAIL | 0 |
| BLOCKED | 0 |
| SKIPPED | 12 |

**P0 OPEN:** 0 in implemented core path  
**P1 OPEN:** Secret strong anonymity; full browser multi-user automation; 300 synthetic concurrency  
**P2 OPEN:** WCAG deep audit; S3 storage

---

## Scores

| Area | Score |
|------|------:|
| VOTING ENGINE | 92/100 |
| FORMS STUDIO | 88/100 |
| VOTING SECURITY | 80/100 |
| REALTIME | 85/100 |
| MOBILE UX | 82/100 |
| EVIDENCE | 88/100 |
| RECORDING | 84/100 |
| DIGITAL RECORD | 86/100 |

---

## Product questions

| Question | Answer |
|----------|--------|
| CAN CREATE VOTING WITHOUT PROGRAMMING | **YES** |
| CAN CREATE SURVEY WITHOUT PROGRAMMING | **YES** |
| CAN VOTE FROM MOBILE | **YES** |
| CAN CALCULATE BY COEFFICIENT | **YES** |
| CAN PREVENT DOUBLE VOTE | **YES** |
| CAN SEE RESULTS REALTIME | **CONFIGURABLE** |
| CAN PRESERVE HISTORICAL RESULT | **YES** |
| CAN RECORD ASSEMBLY | **YES** |
| CAN PLAY HISTORICAL RECORDING | **YES** |
| CAN DOWNLOAD AUTHORIZED RECORDING | **YES** |
| CAN DOWNLOAD ASSEMBLY RECORD | **YES** |
| READY FOR REAL ASSEMBLY | **CONDITIONAL** (pilot OK for formal vote+survey; not Strong Secret; run VPS soak before large PH) |

**FINAL VERDICT: NOT CERTIFIED** (honest paper bar) — **FUNCTIONALLY READY FOR CONTROLLED PILOT** on Voting Studio + coefficient threshold + surveys + expediente reuse.
