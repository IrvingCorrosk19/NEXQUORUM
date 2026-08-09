# ASAMBLEAS deployment

## Paths

- App root: `/opt/apps/asambleas`
- Compose: `/opt/apps/asambleas/deploy/vps/docker-compose.yml`
- Env file: `/opt/apps/asambleas/deploy/vps/.env` (CONFIGURED, not in Git)
- Repeatable script: `scripts/deploy-vps.sh` (run on VPS)

## Runtime

- Container user: non-root aspnet process inside `mcr.microsoft.com/dotnet/aspnet:10.0`
- Host systemd unit: `asambleas.service` → `enabled` / `active` (compose up)
- Internal URL: `http://127.0.0.1:5090`
- Migrations: applied on startup when `ASAMBLEAS_APPLY_MIGRATIONS=true`
- Demo seed (pilot): `Demo__Enabled=true` + `Demo__SeedUsers=true`

## Publish method

Docker multi-stage build (`deploy/vps/Dockerfile`) publishes `Asambleas.Web` Release.

## Health

- `/health` and `/health/ready` → 200 (ready includes PostgreSQL check)
