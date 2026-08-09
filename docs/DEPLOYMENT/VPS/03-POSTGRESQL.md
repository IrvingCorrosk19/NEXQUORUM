# PostgreSQL

## Isolation

- Engine: `postgres:16-alpine` container `asambleas_postgres`
- Database: `asambleas`
- Role: `asambleas_app` (dedicated; not superuser for app runtime beyond container bootstrap)
- Network: Docker bridge `asambleas_net` only (port 5432 not published to host)
- Password: CONFIGURED in `.env`

## Migrations applied

- `20260808090055_20260808_InitialEO001`
- `20260808121759_EO005_VotingIntegrity`
- `20260808123531_EO006_AttendanceRepresentation`

History table name (EF Npgsql): `__ef_migrations_history`

## Safety

No `DROP DATABASE` / `EnsureDeleted` against the live pilot DB during deploy. Restore tests used temporary DB `asambleas_restore_test` then dropped.
