# ASAMBLEAS — Communications Current Slice Functional Certification

**Date:** 2026-08-09  
**Mode:** VERIFY → BREAK → FIX → RETEST → CERTIFY  
**Scope:** Communication & Convocation Center — Slice 1 (as declared)  
**Evidence:** `artifacts/vps/cert-results.json`, `artifacts/vps/cert-comms-slice.mjs`, Playwright Chromium, PostgreSQL 18  

## Verdict

**FINAL VERDICT: CERTIFIED**  
**CAN WE TRUST THIS SLICE? YES** (with noted EXTERNAL SMTP and P1 gaps below)

## Baseline

| Item | Result |
|------|--------|
| `dotnet restore` | PASS |
| `dotnet build -c Release` | PASS (1 obsolete warning ASPDEPR005 KnownNetworks) |
| `dotnet test` UnitTests | PASS 45/45 |
| `dotnet test` SecurityTests | PASS 13/13 |
| `dotnet test` ArchitectureTests | PASS 3/3 |
| `dotnet test` IntegrationTests / E2ETests | FAIL / blocked — fixture requires `asambleas_tests`; migrate conflict `AppliedDecisionRule` already exists (pre-existing, not introduced by EO007). **Not counted as slice certification blocker**; functional evidence collected via live PostgreSQL harness instead. |
| Live harness planned/executed | 51 |
| PASS | 50 |
| FAIL | 0 |
| SKIPPED | 0 |
| EXTERNAL CREDENTIAL REQUIRED | 1 (SMTP real send) |

## Database

| Check | Result |
|-------|--------|
| Migration `EO007_CommunicationCenter` on `asambleas` | PASS |
| Tables (profiles, channels, templates, convocations, recipients, batches, deliveries, events, portal, reminders) | PASS |
| FKs / PKs on communications tables | PASS |
| Fresh DB `asambleas_comms_cert` migrate EO001→EO007 | PASS |
| Fresh DB app boot `:5199` `/health` | PASS |
| Existing DB upgrade preserves assemblies (≥2) | PASS |

## Security & tenancy

| Check | Result | Notes |
|-------|--------|-------|
| Multi-tenant cross GET/PUT OTHER PH | PASS | Ocean session → OTHER PH → 400 not found / denied |
| RBAC President | PASS | configure + send |
| RBAC Secretary view | PASS | |
| RBAC Owner config/create | PASS | 403 |
| Anonymous | PASS | 401 |
| Secret not in GET channel DTO | PASS | `hasSecret=true`, plaintext absent |
| Encryption at rest | PASS | ciphertext length 155, plaintext marker absent in PG |
| Audit without secrets | PASS | |
| CSRF without antiforgery | PASS | 400 |
| Overposting status/tenantId | PASS | remains Draft |
| XSS `<script>` in template HTML | PASS | rejected |
| URL credential leakage | PASS | no password/secret in URLs exercised |

## Functional

| Check | Result | Notes |
|-------|--------|-------|
| Sandbox default Development | PASS | |
| Communications UI persist | PASS | Playwright |
| Convocation UI create | PASS | Playwright |
| Responsive viewports | PASS | 390–1920 |
| Browser console unexpected | PASS | 0 after auth settle |
| Email Mock + Portal 8 recipients | PASS | **16 deliveries**, 0 failed |
| UI/API/DB delivery count | PASS | 16/16/16 |
| Delivery states | PASS | Portal=`Delivered`; Mock Email=`Sent` (**MOCK acceptance ≠ mailbox Delivered**) |
| Send confirmation phrase | PASS | wrong/empty reject; correct accepts |
| Double/multi send protection | PASS | atomic claim + idempotency → 400 ALREADY_SENT |
| Disabled channel send | PASS | CHANNEL_DISABLED |
| Partial failure | PASS | Email `simulateFailure` + Portal → status `Partial` |
| Empty recipients | PASS | rejected |
| Provider/channel mismatch | PASS | |
| WhatsApp Mock | PASS | |
| SMS Mock | PASS | |
| Portal owner inbox + read | PASS | |
| Historical body after template mutate | PASS | convocation body snapshotted at create |
| 300 synthetic Portal mock | PASS | send ~671ms, totalCount=300 |
| Core assembly/quorum/agenda smoke | PASS | |
| SMTP configuration validation | PASS | host/port/from required when Smtp enabled |
| SMTP real test | EXTERNAL CREDENTIAL REQUIRED | |

## Remediations performed during certification (7)

1. SMTP settings validation when enabling Smtp  
2. Reject send when selected channel disabled  
3. Atomic send claim (`ExecuteUpdate` Draft/Ready/Approved → Sending)  
4. Mock `simulateFailure` setting for partial/failure evidence  
5. Portal `POST /api/communications/portal/{id}/read`  
6. Stable send idempotency key + button busy state in UI  
7. Browser E2E waits for post-login navigation before console accounting  

## P0 open

None for declared slice scope.

## P1 open

1. Full WCAG 2.2 AA audit (only smoke labels/skip-link)  
2. Rich failure UX matrix (per-recipient retry actions) — retry API not in slice  
3. Integration/E2E automated suite DB fixture conflict (pre-existing)  
4. Real SMTP pilot when credentials are authorized  

## P2 open

1. Loading indicators not yet uniform on every async control  
2. Template preview UI surface  
3. Dedicated multi-tab Playwright race (API atomic claim covers concurrency)  

## Explicitly out of scope (not expanded)

Real WhatsApp, Real SMS, PDF/QR, reminder scheduler, webhooks, evidence ZIP, outbox async.

## Next recommended slice (one)

**PDF convocation + QR secure links** — completes legal delivery artifact on top of certified send/tracking without Meta/Twilio credentials.
