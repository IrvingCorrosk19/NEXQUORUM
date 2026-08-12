#!/usr/bin/env bash
set -euo pipefail
APP_ROOT=/opt/apps/asambleas
COMPOSE_DIR="$APP_ROOT/deploy/vps"
STAMP=$(date +%Y%m%d_%H%M%S)
BACKUP="$COMPOSE_DIR/backups/pre_perf_${STAMP}.sql.gz"

echo "== Pre-deploy disk =="
df -h / /opt | tail -n +2

echo "== Current containers =="
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'asambleas|NAMES' || true

echo "== DB backup =="
mkdir -p "$COMPOSE_DIR/backups"
cd "$COMPOSE_DIR"
set -a; source .env; set +a
docker exec asambleas_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' | gzip > "$BACKUP"
ls -la "$BACKUP"

echo "== Extract source =="
cd "$APP_ROOT"
tar -xzf /tmp/asambleas-src.tgz

echo "== LiveKit keys sync =="
python3 - <<PY
from pathlib import Path
import re
env = Path("$COMPOSE_DIR/.env").read_text()
secret = re.search(r'^LIVEKIT_API_SECRET=(.+)$', env, re.M).group(1).strip()
key = re.search(r'^LIVEKIT_API_KEY=(.+)$', env, re.M).group(1).strip()
p = Path("$COMPOSE_DIR/livekit.yaml")
text = p.read_text()
text = re.sub(r'(?m)^keys:\n(?:  .*\n)*', f'keys:\n  {key}: "{secret}"\n', text, count=1)
p.write_text(text)
print('livekit.yaml ok')
PY

echo "== Build & up =="
cd "$COMPOSE_DIR"
docker compose -f docker-compose.yml --project-name asambleas build asambleas_web
docker compose -f docker-compose.yml --project-name asambleas up -d

echo "== Wait health =="
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:5090/health/ready >/dev/null 2>&1; then
    echo HEALTH_READY_OK
    break
  fi
  sleep 3
done

echo "== Migration history tail =="
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT \"MigrationId\" FROM __ef_migrations_history ORDER BY 1 DESC LIMIT 3;"'

echo "== Git-less commit marker =="
docker inspect asambleas_web --format '{{.Image}}' | head -1

echo "== nginx reload =="
cp "$COMPOSE_DIR/nginx-asambleas.conf" /etc/nginx/sites-available/asambleas.conf
ln -sf /etc/nginx/sites-available/asambleas.conf /etc/nginx/sites-enabled/asambleas.conf
nginx -t && systemctl reload nginx

echo "DEPLOY_OK backup=$BACKUP"
