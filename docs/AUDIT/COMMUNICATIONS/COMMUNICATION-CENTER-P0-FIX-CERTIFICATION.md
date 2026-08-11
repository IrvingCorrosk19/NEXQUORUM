# ASAMBLEAS — Communication Center P0 Fix Certification

**Date:** 2026-08-10  
**VPS:** https://asambleas.164.68.99.83.nip.io/  
**Commits:** `4c267d5`, `13c5e0e`

## Root causes (proven)

### Profile HTTP 400
- **Code:** `TEST_OVERRIDE_PROD`
- **CorrelationId (repro):** `99ceebe8cbb340d0b1fa2728818086e9`
- **Cause:** `UpdateProfileAsync` rejected any non-empty `TestRecipientOverride` when `ASPNETCORE_ENVIRONMENT=Production`, even with Sandbox enabled/disabled.
- **Evidence:** VPS log + API body `detail: Test recipient override is not allowed in production.`

### SMTP test HTTP 500
- **Exception:** `System.InvalidOperationException: The requested operation requires an element of type 'Number', but the target element has type 'String'.`
- **Location:** `SmtpClientSettings.FromJson` — `port` stored as `"587"` (string from UI `<input>`)
- **CorrelationId (repro):** `e8f8ac766c3047f4a867444b6c3f8287`

## Fixes
1. Allow test recipient in Production (sandbox redirect only applies when Sandbox=true).
2. Normalize empty ReplyTo → null; validate IANA timezone + emails.
3. Parse SMTP `port`/`useSsl` as Number **or** String.
4. Map SMTP failures to safe codes; decrypt failures → DomainException (not 500).
5. Persist DataProtection keys on Docker volume.

## Post-deploy verification
- PUT profile (Sandbox=false + recipient + America/Panama + empty ReplyTo): **200**
- POST Email/test: **200** `succeeded=true`
- `lastTestDetail`: `SMTP accepted message for delivery. | ResolvedProvider=Smtp | Sandbox=false`
- TCP/STARTTLS to smtp.gmail.com:587 (IPv4): **PASS**
