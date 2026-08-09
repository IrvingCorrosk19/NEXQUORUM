# AUTH URL Security Remediation

**Date:** 2026-08-09  
**Severity:** P0  
**Status:** REMEDIATED

## Incident

Credentials were observed in a browser URL shaped like `/?email=…&password=…`.

## Root cause

The login `<form>` defaulted to **GET** (no `method="post"`) and used `name="email"` / `name="password"`.  
Any native submit (before JS `preventDefault`, or tooling that submits the form) serialized credentials into the query string.

This is **not** fixed by `history.replaceState` alone.

## Fixes

1. Login form: `method="post"`, **no `name` attributes** on credential inputs (IDs only; JS reads values).
2. Authentication only via `POST /api/auth/login` JSON body over HTTPS.
3. `CredentialQueryGuardMiddleware` redirects away any request whose query contains password-like keys.
4. Nginx ASAMBLEAS access log uses `$uri` (no query string).
5. Exposed demo password **revoked** and rotated via `Demo:Password` / `DEMO_PASSWORD` (not in Git).
6. Secure cookies (`HttpOnly`, `Secure` in Production), lockout, login rate limit, session re-issue after login.
7. Automated regression: `AuthUrlSecurityTests`.

## Log review

Nginx historically logged full `$request` including query for some sites. ASAMBLEAS now uses `asambleas_safe` format.  
Occurrences of `password=` in prior access logs (if any) are treated as exposure evidence; password values must not be copied into tickets.

## Credentials

- SSH credentials: CONFIGURED  
- Database credentials: CONFIGURED  
- Demo password: CONFIGURED (rotated; not documented here)
