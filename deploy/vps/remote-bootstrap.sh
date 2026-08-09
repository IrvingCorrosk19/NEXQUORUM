#!/usr/bin/env bash
# Remote bootstrap for ASAMBLEAS on this VPS. Secrets are generated locally on the server.
set -euo pipefail

APP_ROOT=/opt/apps/asambleas
BACKUP_DIR=/opt/backups/asambleas/$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR" "$APP_ROOT/deploy/vps/backups" /opt/backups/asambleas

echo "== Backup nginx sites list =="
ls -la /etc/nginx/sites-enabled > "$BACKUP_DIR/sites-enabled.txt" || true
cp -a /etc/nginx/sites-available/asambleas.conf "$BACKUP_DIR/" 2>/dev/null || true

echo "== Ensure deploy directory =="
mkdir -p "$APP_ROOT"

if [[ ! -f "$APP_ROOT/deploy/vps/.env" ]]; then
  echo "== Generating .env (first deploy) =="
  DB_PASS=$(openssl rand -base64 32 | tr -d '\n=/+' | cut -c1-40)
  LK_SECRET=$(openssl rand -base64 48 | tr -d '\n=/+' | cut -c1-64)
  cat > "$APP_ROOT/deploy/vps/.env" <<EOF
POSTGRES_DB=asambleas
POSTGRES_USER=asambleas_app
POSTGRES_PASSWORD=${DB_PASS}
ASAMBLEAS_HOST_PORT=5090
DEMO_ENABLED=true
DEMO_PUBLIC_USER_LIST=true
LIVEKIT_URL=wss://livekit-asambleas.164.68.99.83.nip.io
LIVEKIT_API_KEY=ASAMBLEAS_DEVKEY
LIVEKIT_API_SECRET=${LK_SECRET}
LIVEKIT_DEFAULT_ROOM_PREFIX=assembly-
LIVEKIT_HTTP_PORT=7880
LIVEKIT_RTC_TCP_PORT=7881
LIVEKIT_UDP_PORT_RANGE=7882-7892
EOF
  chmod 600 "$APP_ROOT/deploy/vps/.env"
else
  echo "== Reusing existing .env =="
  # shellcheck disable=SC1091
  set -a
  source "$APP_ROOT/deploy/vps/.env"
  set +a
  LK_SECRET="${LIVEKIT_API_SECRET}"
fi

echo "== Sync LiveKit keys into livekit.yaml =="
# shellcheck disable=SC1091
set -a
source "$APP_ROOT/deploy/vps/.env"
set +a
python3 - <<PY
from pathlib import Path
p = Path("$APP_ROOT/deploy/vps/livekit.yaml")
text = p.read_text()
secret = """${LIVEKIT_API_SECRET}"""
key = """${LIVEKIT_API_KEY}"""
import re
text = re.sub(r'(?m)^keys:\n(?:  .*\n)*', f"keys:\n  {key}: \"{secret}\"\n", text, count=1)
if "REPLACE_ME_LIVEKIT_SECRET" in text:
    text = text.replace("REPLACE_ME_LIVEKIT_SECRET", secret)
p.write_text(text)
print("livekit.yaml keys updated")
PY

echo "== Docker compose build/up =="
cd "$APP_ROOT/deploy/vps"
docker compose -f docker-compose.yml --project-name asambleas build
docker compose -f docker-compose.yml --project-name asambleas up -d

echo "== Nginx site =="
cp "$APP_ROOT/deploy/vps/nginx-asambleas.conf" /etc/nginx/sites-available/asambleas.conf
ln -sf /etc/nginx/sites-available/asambleas.conf /etc/nginx/sites-enabled/asambleas.conf
nginx -t
systemctl reload nginx

echo "== Firewall =="
ufw allow 8092/tcp comment 'ASAMBLEAS HTTP pilot' || true
ufw allow 7880/tcp comment 'ASAMBLEAS LiveKit signaling' || true
ufw allow 7881/tcp comment 'ASAMBLEAS LiveKit RTC TCP' || true
ufw allow 7882:7892/udp comment 'ASAMBLEAS LiveKit RTC UDP' || true
ufw reload || true

echo "== systemd helper =="
cat > /etc/systemd/system/asambleas.service <<'UNIT'
[Unit]
Description=ASAMBLEAS Docker Compose stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/apps/asambleas/deploy/vps
ExecStart=/usr/bin/docker compose -f docker-compose.yml --project-name asambleas up -d
ExecStop=/usr/bin/docker compose -f docker-compose.yml --project-name asambleas stop
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable asambleas.service
systemctl start asambleas.service

echo "== Wait health =="
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:5090/health/live >/dev/null 2>&1; then
    echo "HEALTH_LIVE_OK"
    break
  fi
  sleep 3
done
curl -fsS http://127.0.0.1:5090/health || true
echo
curl -fsS http://127.0.0.1:5090/health/ready || true
echo

echo "== Container status =="
docker compose -f docker-compose.yml --project-name asambleas ps

echo "== Backup cron (pg_dump) =="
cat > /usr/local/bin/asambleas-pg-backup.sh <<'BKP'
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d_%H%M%S)
OUT=/opt/apps/asambleas/deploy/vps/backups/asambleas_${STAMP}.sql.gz
mkdir -p /opt/apps/asambleas/deploy/vps/backups
docker exec asambleas_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$OUT"
# retain 14 days
find /opt/apps/asambleas/deploy/vps/backups -name 'asambleas_*.sql.gz' -mtime +14 -delete
BKP
chmod 700 /usr/local/bin/asambleas-pg-backup.sh
(crontab -l 2>/dev/null | grep -v asambleas-pg-backup || true; echo "15 3 * * * /usr/local/bin/asambleas-pg-backup.sh") | crontab -

echo "BOOTSTRAP_DONE"
