# Backup / restore

## Backup

- Script: `/usr/local/bin/asambleas-pg-backup.sh`
- Output: `/opt/apps/asambleas/deploy/vps/backups/asambleas_*.sql.gz`
- Cron: enabled during bootstrap (pilot retention — prune older dumps if disk pressure)

## Restore test (executed)

1. `pg_dump` → gzip
2. Create temp DB `asambleas_restore_test`
3. Restore dump
4. Verified `__ef_migrations_history` rows = 3 and `AspNetUsers` count = 8
5. Dropped temp DB

Passwords are not stored in backup documentation.
