#!/bin/bash
set -euo pipefail
BACKUP_DIR="/opt/apps/asambleas/deploy/vps/backups"
STAMP=$(date -u +%Y%m%d_%H%M%S)
BACKUP="$BACKUP_DIR/asambleas_vps_pre_total_wipe_${STAMP}.sql.gz"
mkdir -p "$BACKUP_DIR"

echo "KEEP_CHECK"
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM \"AspNetUsers\" WHERE lower(\"Email\")=lower('"'"'president@ocean.demo'"'"');"'

echo "BACKUP $BACKUP"
docker exec asambleas_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' | gzip > "$BACKUP"
ls -lh "$BACKUP"

echo "BEFORE"
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM \"AspNetUsers\";"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM property_horizontals;"'

echo "APPLY_SQL"
docker exec -i asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < /tmp/wipe_vps_total.sql

echo "AFTER"
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM \"AspNetUsers\";"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT \"Email\" FROM \"AspNetUsers\";"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT r.\"Name\" FROM \"AspNetUserRoles\" ur JOIN \"AspNetUsers\" u ON u.\"Id\"=ur.\"UserId\" JOIN \"AspNetRoles\" r ON r.\"Id\"=ur.\"RoleId\";"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM property_horizontals;"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM assemblies;"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM units;"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM owners;"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM user_property_memberships;"'

ENV_FILE="/opt/apps/asambleas/deploy/vps/.env"
if grep -q '^DEMO_ENABLED=' "$ENV_FILE"; then
  sed -i 's/^DEMO_ENABLED=.*/DEMO_ENABLED=false/' "$ENV_FILE"
else
  echo 'DEMO_ENABLED=false' >> "$ENV_FILE"
fi
grep '^DEMO_ENABLED=' "$ENV_FILE"
cd /opt/apps/asambleas/deploy/vps
docker compose up -d --force-recreate asambleas_web
sleep 8
docker exec asambleas_web printenv Demo__Enabled
docker exec asambleas_web printenv Demo__SeedUsers
echo "WIPE_OK $BACKUP"