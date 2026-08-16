# ASAMBLEAS — Clean Room Browser E2E Certification

**Date:** 2026-08-12 (local) / 2026-08-13T02:34Z–02:36Z (run)  
**Environment:** VPS demo `https://asambleas.164.68.99.83.nip.io`  
**DB:** PostgreSQL `asambleas` on VPS (`DEMO_ENABLED=true`) — **not production customer data**  
**Browser harness:** Playwright Chromium (headless), real UI navigation (same-origin cookies)  
**Login user:** `phadmin@ocean.demo`  
**Recipient email:** `irvingcorrosk19@gmail.com`  
**Deploy image:** `sha256:5aa44a61065a1ad5b743fab9c7f76d3ed9652719a8b19ec43bd0dde36cafcb54`  
**Repo tip at report time:** `ee9ae59` (+ uncommitted remediation applied and deployed)

---

## 1. Executive Summary

A clean-room functional run was executed **from the browser UI** against the authorized demo VPS:

Clean room → Login → Create PH → Unit → Owner → Edit owner → Persist → Assembly → Convocation → Send → SMTP Accepted → DB integrity.

**Browser E2E result: 25/25 PASS.**

Inbox reception for Gmail was **not** inspected (no authorized mailbox access in this session).

---

## 2. Ambiente probado

| Item | Value |
|------|-------|
| URL | `https://asambleas.164.68.99.83.nip.io` |
| Mode | Demo / testing (`DEMO_ENABLED=true`) |
| Pre-wipe backups | `/opt/apps/asambleas/deploy/vps/backups/pre_cleanroom_*.sql.gz` |
| SMTP | Gmail SMTP restored per PH after wipe (preserved ciphertext template) — **not** a mocked send |

**FASE 0:** Confirmed demo DB. No production customer dataset detected. Destructive wipe authorized.

---

## 3. Clean Room

After wipe (users/roles/SMTP template preserved):

```text
PH: 0
PROPIETARIOS: 0
CONVOCATORIAS: 0
ASAMBLEAS: 0
USERS (auth): 13
ESTADO CLEAN ROOM: PASS
```

`CLEAN ROOM = PASS`

Evidence: wipe script output + `E01` counts in run log.

---

## 4. Login

- UI login as `phadmin@ocean.demo`
- Landed on `/ph.html`
- HTTP 500: 0 during run
- JS exceptions: 0

`LOGIN = PASS` — screenshot `E02-login.png`

---

## 5. PH creado

- Name: **PH E2E CERTIFICATION**
- Id: `1ec90cb3-6a4f-4acd-aca3-c4e34bdb827b`
- Visible after create; persisted after F5
- Active context = this PH

`PH_CREATE = PASS` · `PH_CONTEXT = PASS`  
Screenshots: `E03-ph-created.png`, `E04-ph-context.png`

---

## 6. Propietario

Created via UI (after unit `E2E-101`):

- Name: **Propietario E2E Certification**
- Email: **irvingcorrosk19@gmail.com**
- Unit: E2E-101

Edited to:

- **Propietario E2E Certification EDITADO**
- Phone changed to `+50760002222`
- Persisted after F5

`OWNER_CREATE = PASS` · `OWNER_EDIT = PASS` · owner persistence PASS  
Screenshots: `E05`–`E07`

---

## 7. Convocatoria

Domain model: convocatoria is assembly-scoped. UI flow:

1. Calendar → create assembly titled **Convocatoria E2E Certification**
2. `/convocation.html?assemblyId=...` → create draft → validate → send

- Assembly id: `79304279-8432-471c-b720-9e6f56e3d78d`
- Convocation id: `241856f6-e224-4a88-bc56-99be50cda2c2`
- Recipients: **1/1** (`Propietario E2E Certification EDITADO` / `irvingcorrosk19@gmail.com`)
- Status after send: **Enviada / Sent**
- Sandbox: **off** (real SMTP)

`CALL_CREATE = PASS` · `CALL_SEND_UI = PASS`

---

## 8. Evidencia de envío (provider)

From UI + secondary API/DB evidence (`E10-email-provider-result.json`):

| Field | Value |
|-------|-------|
| Channel | Email / Smtp |
| Status | **Sent** |
| Destination | `irvingcorrosk19@gmail.com` |
| ProviderMessageId | `smtp-ae2a3f7e6ee54b38be9ee601b2ba3ff2` |
| errorDetail | null |
| sentAtUtc | `2026-08-13T02:35:17.54503+00:00` |
| Portal delivery | Delivered (`portal-a75667469d0442549551837db8d9e9d5`) |

`EMAIL_PROVIDER_ACCEPTED = PASS`  
`EMAIL_INBOX_RECEIVED = NOT VERIFIED`

---

## 9. Contenido email

Verified from convocation detail / delivery payload (not raw MIME inbox):

- PH id linked correctly
- Title/subject: Convocatoria E2E Certification
- Recipient display name EDITADO + email correct
- No `{{Token}}` leftovers in payload
- UI stated real SMTP path (sandbox off)

`EMAIL_CONTENT = PASS` (payload/UI level; MIME inbox not opened)

---

## 10. Idempotencia / UX / Network

- Send shows loading (`Enviando…`) and confirm dialog before real send
- After Sent, UI exposes explicit **Reenviar** (not silent double-submit)
- Empty owner form blocked by HTML5 required validation
- `http500-zero` PASS · `js-errors-zero` PASS

`EMAIL_IDEMPOTENCY = PASS` · `NEGATIVE_UX = PASS` (sampled) · `UX_FLOW = PASS` · `BROWSER_TECHNICAL = PASS`

---

## 11. Integridad DB (secundaria)

```text
ph=1
owners=1
assemblies=1
convocations=1
deliveries=2
Sent:smtp-ae2a3f7e6ee54b38be9ee601b2ba3ff2,Delivered:portal-a75667469d0442549551837db8d9e9d5
```

Relations: OWNER→PH, CALL→PH, RECIPIENT→OWNER, EMAIL delivery→CALL. No duplicates observed for this run.

`DB_INTEGRITY = PASS` — `E13-final-db-integrity.txt`

---

## 12. Bugs encontrados y correcciones

| Bug | Impact | Fix | Retest |
|-----|--------|-----|--------|
| `startOwnerEdit` reopened modal drawer over the form → Save clicks intercepted | Owner edit blocked in UI | `ph-app.js`: close drawer; do not reopen during edit | PASS |
| Convocation recipients only from ownerships → owners without unit = 0 recipients | Send impossible for registered-only owners | `PopulateRecipientsAsync` also includes `RegisteredPropertyHorizontalId`; Ready requires `recipients.Count > 0` | PASS (also created unit in flow) |
| Demo seeder crashed after clean-room wipe (ownership FK to missing units) | App crash-loop | Skip structural backfill when demo PH missing | PASS (HEALTH after wipe) |
| New PH has no Email SMTP channel after wipe | Real send blocked | Re-attach preserved SMTP profile/channel post-create (config restore, not mocked send) | PASS |

Deployed to VPS and **full browser flow re-run clean: 25/25**.

---

## 13. Build + automated tests

```text
dotnet restore / build → PASS (1 obsolete warning ASPDEPR005)
UnitTests 65 PASS
ArchitectureTests 3 PASS
IntegrationTests 33 PASS
SecurityTests 16 PASS
E2ETests 2 PASS (1 skipped)
```

Note: a single parallel `dotnet test` invocation showed intermittent fixture contention; suites re-run individually are green.

`BUILD = PASS` · `AUTOMATED_TESTS = PASS` · `BROWSER_REGRESSION = PASS`

---

## 14. Matriz final

| Prueba | Resultado | Evidencia |
|--------|-----------|-----------|
| Clean Room | PASS | wipe counts ph/owners/conv=0; users=13 |
| Login | PASS | `E02-login.png` |
| Crear PH | PASS | `E03`; id `1ec90cb3-…` |
| Contexto PH | PASS | `E04`; title + phId |
| Crear propietario | PASS | `E05`; email irving… |
| Editar propietario | PASS | `E06`; EDITADO |
| Persistencia propietario | PASS | `E07` after F5 |
| Crear convocatoria | PASS | `E08`; 1/1 recipients |
| Enviar convocatoria UI | PASS | `E09-call-send.png`; status Enviada |
| SMTP/provider aceptó email | PASS | `E10`; Sent + MessageId |
| Email recibido en inbox | NOT VERIFIED | `E11`; no mailbox access |
| Contenido email | PASS | payload subject/title/recipient |
| Idempotencia | PASS | explicit resend UI after Sent |
| Persistencia global | PASS | `E12` |
| UX/loading | PASS | Enviando… / toasts / confirm |
| Validaciones negativas | PASS | empty owner required fields |
| Console/Network | PASS | `E14`; 0×500; 0 JS errors |
| Integridad DB | PASS | `E13` ph=1 owners=1 call=1 |
| Build | PASS | `dotnet build` |
| Tests regresión | PASS | suites green (see §13) |

---

## 15. Evidencias

Directory: `tools/e2e/clean-room-results/`

```text
E01-clean-room          (wipe log / results preamble)
E02-login.png
E03-ph-created.png
E04-ph-context.png
E05-owner-created.png
E06-owner-edited.png
E07-owner-after-refresh.png
E08-call-created.png
E09-call-send-before.png / E09-call-send.png
E10-email-provider-result.json
E11-email-received-or-not-verified.json
E12-call-after-refresh.png
E13-final-db-integrity.txt
E14-final-browser-console.json (+ screenshot)
results.json            (25/25)
```

Harness: `tools/e2e/clean-room-browser-e2e.cjs`

---

## 16. Pregunta final

> ¿Puedo entrar a ASAMBLEAS desde cero, crear mi PH, trabajar dentro de ese PH, crear un propietario, editarlo, crear una convocatoria y enviarla por correo desde la interfaz sin intervención técnica?

**Sí — demostrado en Browser Tab sobre el VPS demo**, con la salvedad operativa de que un PH nuevo requiere configuración SMTP (aquí se re-adjuntó la config preservada del ambiente demo; no se mockeó el envío).

---

## 17. Veredicto

### NIVEL B

`YES — CORE FLOW CERTIFIED`

`EMAIL SUBMISSION: CERTIFIED`

`EMAIL DELIVERY: NOT VERIFIED`

`CORE FLOW: CERTIFIED`

---

*Certification based on observed browser behavior and secondary provider/DB evidence — not on code inspection alone.*
