# ADR-005 — Meeting Provider

**Status:** Accepted  
**Date:** 2026-08-08  
**EO:** EO-001

## Context

Audio/video must not leak into voting, quorum, or attendance legal semantics.

## Decision

```text
Meeting module → IMeetingProvider → LiveKitMeetingProvider → LiveKit
```

- Backend mints participant tokens; browser never sees API secret.
- Credentials only via env / User Secrets / secret manager.
- Video presence ≠ voting rights; ASAMBLEAS domain remains authoritative.
- If LiveKit credentials are absent, app still runs; AV integration marked **BLOCKED**.

## Consequences

- Clear seam for future providers (Twilio, custom SFU).
- Manual human A/V acceptance remains separate from automated meeting integration tests.
