#!/usr/bin/env bash
# Repeatable ASAMBLEAS VPS deploy helper (run ON the VPS as root/ops).
# Secrets must already exist in /opt/apps/asambleas/deploy/vps/.env — never commit that file.
set -euo pipefail
APP_ROOT=/opt/apps/asambleas
cd "$APP_ROOT/deploy/vps"
test -f .env
set -a; source .env; set +a
docker compose -f docker-compose.yml --project-name asambleas build asambleas_web
docker compose -f docker-compose.yml --project-name asambleas up -d
cp nginx-asambleas.conf /etc/nginx/sites-available/asambleas.conf
ln -sf /etc/nginx/sites-available/asambleas.conf /etc/nginx/sites-enabled/asambleas.conf
nginx -t
systemctl reload nginx
systemctl enable asambleas >/dev/null 2>&1 || true
curl -fsS http://127.0.0.1:5090/health/ready >/dev/null
echo "ASAMBLEAS deploy OK"