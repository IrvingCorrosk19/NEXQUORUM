# Rollback

## Application image

```bash
cd /opt/apps/asambleas/deploy/vps
# redeploy previous known image tag / rebuild from previous source tarball
docker compose --project-name asambleas up -d
```

Keep previous publish artifacts/tarballs outside Git if needed for quick rollback.

## Nginx

Restore from `/opt/backups/asambleas/<timestamp>/asambleas.conf` (bootstrap copies site before change), then `nginx -t && systemctl reload nginx`.

## Database

Restore last good `asambleas_*.sql.gz` into a **new** database for verification first; only swap after validation. Never drop live DB blindly.

## LiveKit

`docker compose --project-name asambleas up -d asambleas_livekit` with previous `livekit.yaml` backup.

## Do not

- Force-push secrets into Git
- Overwrite unrelated Nginx sites
- Reboot VPS solely for ASAMBLEAS rollback
