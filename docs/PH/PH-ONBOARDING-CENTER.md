# PH & Owner Onboarding Center

## Tenancy decision
- **Tenant** owns many **Organizations**; each organization owns many **Property Horizontals (PH)**.
- **PH ≠ Tenant**. Multi-PH users are linked via `user_property_memberships`.
- Tower/block is an optional `Unit.Tower` string (no separate Building entity).

## Product flow (UI)
1. `/ph.html` — list PHs → **Crear PH**
2. Detail tabs: Información → Unidades → Propietarios → Coeficientes → Importar → Readiness
3. Wizard progress steps 1–8 (onboarding step on PH)
4. Ready for assembly (coefficients must total 100% within 0.0001) → Activate
5. Invite owners → `/activate.html?token=...` (no password in URL)

## APIs
- `GET/POST /api/ph`
- `GET/PUT /api/ph/{id}`
- Units / owners / ownerships / coefficients / readiness / activate / ready
- Import: template, analyze, validate, commit, errors
- `GET /api/ph/memberships/mine` + `POST /api/ph/switch`
- `POST /api/ph/invitations/activate` (anonymous)

## Permissions
`ph:view|manage`, `unit:view|manage`, `owner:view|manage|invite`, `ph:import`

## Coefficient rules
- Stored on **Unit** (`decimal(7,4)`). Ownership `SharePercent` is share of the unit, not PH coefficient.
- Draft PH may sum ≠ 100%. Ready-for-assembly requires complete total.
- Validation is server-side (`CoefficientValidator`).

## Import
- CSV / XLSX, column mapping synonyms, preview with errors/warnings, all-or-nothing commit.
- Sessions are in-memory (single instance). Error report: `IMPORT-ERRORS.xlsx`.
