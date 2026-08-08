# EO-006 — Accreditation

Accreditation ≠ login ≠ SignalR connection.

Fields: `IsAccredited`, `AccreditedAtUtc`, `AccreditedByUserId`, `EffectiveCoefficientPercent`.

Operator: `POST .../participants/{userId}/accredit` (`attendance:manage`).

Self: `POST .../attendance/check-in`.

Idempotent replay when already accredited + present-ish.
