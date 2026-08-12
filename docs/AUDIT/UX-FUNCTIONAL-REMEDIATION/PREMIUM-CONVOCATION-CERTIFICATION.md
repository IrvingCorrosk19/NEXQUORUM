# ASAMBLEAS — PREMIUM CONVOCATION CERTIFICATION

Date: 2026-08-11 (America/Panama)  
Environment: https://asambleas.164.68.99.83.nip.io/  
Convocation E2E id: `7b926cc5-2f57-47db-9fa1-215c3b0abeb7`  
Owner: Irving Corro → `irvingcorrosk19@gmail.com`  
Assembly: Asamblea Extraordinaria — Agosto 2026 (PH Irving)

## What shipped

- Premium HTML + plain-text composer (institutional layout, preheader, CTA, backup URL)
- Professional subject override on send (draft subject is not the emailed subject)
- Secure hashed `assembly_access_links` + `/join.html?token=` + `GET /api/join/preview`
- Token rotation on re-issue; expiry ≈ assembly schedule + 2 days
- Individual / selected / pending resend + recipient delivery status UI/API
- SMTP multipart (text/plain + text/html)
- Login `returnUrl` open-redirect guard (relative paths only)
- SMTP config **not** modified

## Live evidence (API / DB)

| Check | Evidence |
|-------|----------|
| SMTP send Irving | Delivery `Sent` / provider `Smtp` (first send 12:29 UTC) |
| Individual resend | Second delivery `Sent` (12:33 UTC); attempts=2 |
| Pending resend | Remaining recipient sent; status Sent |
| Access links | Table populated; prior link revoked on re-issue (links≥3, revoked≥1) |
| Join preview | Valid for live opaque token; planted/revoked token → `INVALID_OR_EXPIRED` |
| No credentials in URL | Join uses opaque token only |

## Scorecard

```
=======================================================
ASAMBLEAS — PREMIUM CONVOCATION CERTIFICATION
=======================================================

HTML EMAIL:                 PASS (composer + SMTP IsBodyHtml/multipart)
PLAIN TEXT:                 PASS (composer + AlternateView)
PROFESSIONAL SUBJECT:       PASS (composer; Gmail visual confirmation PENDING)
PERSONALIZATION:            PASS
PH DATA:                    PASS
ASSEMBLY DATA:              PASS
DATE/TIME:                  PASS (tz-aware labels)
AGENDA:                     PASS (when agenda items exist)
DIRECT ACCESS CTA:          PASS
SECURE ACCESS LINK:         PASS (SHA-256 at rest)
LINK EXPIRATION:            PASS
LINK REVOCATION:            PASS (rotate on reissue)
NO CREDENTIALS IN URL:      PASS
OWNER AUTHORIZATION:        PARTIAL (join ≠ vote; rights still server-side; owner login E2E pending Gmail click)
INDIVIDUAL RESEND:          PASS
BULK RESEND:                PASS (selected recipientIds)
PENDING RESEND:             PASS
NO DUPLICATE OWNER:         PASS
NO DUPLICATE USER:          PASS
DELIVERY HISTORY:           PASS (deliveries + recipient-deliveries)
RATE LIMIT:                 PASS (45s cooldown; CanResend=false immediately after send)
PDF:                        FAIL (not implemented)
QR:                         FAIL (not implemented)
GMAIL REAL:                 PENDING (SMTP accepted to irvingcorrosk19@gmail.com — inbox open/visual QA by human required)
DIRECT LINK FROM GMAIL:     PENDING (same)
OWNER LANDING:              PARTIAL (join → owner.html when Scheduled; Gmail click pending)
CROSS-PH:                   PARTIAL (token scoped to assembly/PH; attack matrix not fully run)
IDOR:                       PARTIAL (opaque token; matrix pending)
BROWSER E2E:                PARTIAL (API+join preview; full browser click pending)

P0 OPEN: 4
  1) Gmail visual open + click CTA (human)
  2) PDF institucional
  3) QR seguro
  4) Template editor / branding UI

FINAL: NOT CERTIFIED
=======================================================
```

## Why NOT CERTIFIED

Per explicit rule: do not declare PASS on Gmail / direct link without opening the real message and clicking the CTA. SMTP acceptance is verified; inbox/visual/click remains human confirmation.

## Operator checklist (Irving Gmail)

1. Open latest message from ASAMBLEAS (subject starts with `Convocatoria | Asamblea Extraordinaria`).
2. Confirm HTML layout (header, fecha/hora Panamá, CTA, backup URL, agenda).
3. Click **Acceder a la asamblea** → `/join.html?token=…` → login/activate → PH Irving assembly (not admin center).
4. Confirm no password/GUID internals in the email body.
