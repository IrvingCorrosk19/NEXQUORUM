# Assembly timezone

PH `TimeZoneId` (IANA, e.g. `America/Panama`) drives wall-clock conversion.

## Conversion

- Frontend: `phLocalToUtcIso(date, time, timeZoneId)` / `utcIsoToPhLocalParts` in `schedule-time.js`.
- Backend: persists `ScheduledAtUtc` / `EstimatedEndAtUtc` as UTC instants.
- Calendar cards render with `formatInTz(..., timeZoneId)`.
- UI hint examples: **Hora de Panamá**, **Hora de Bogotá**.

## Round-trip expectation

Wall clock `20 ago 2026 · 7:00 PM` in `America/Panama` → `2026-08-21T00:00:00Z` → reload shows `7:00 PM`.

Panamá has no DST; IANA zones still apply for other PH.
