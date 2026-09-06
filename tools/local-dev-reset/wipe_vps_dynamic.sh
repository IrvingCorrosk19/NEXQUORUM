#!/bin/bash
set -euo pipefail

CANDIDATES="votes voting_eligibility_snapshots voting_sessions motions agenda_items speaker_requests attendance_records assembly_participants assembly_votes quorum_snapshots assembly_recordings recording_notice_acceptances property_recording_policies survey_responses survey_questions survey_forms communication_delivery_events communication_deliveries communication_batches convocation_recipients convocations assembly_access_links portal_notifications reminder_rules message_templates channel_configurations communication_profiles assembly_schedule_changes assembly_reminder_occurrences audit_events powers ownerships owner_invitations owner_password_resets user_property_memberships assemblies units owners property_horizontals"

EXISTING=""
for t in $CANDIDATES; do
  ex=$(docker exec asambleas_postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -c \"SELECT CASE WHEN to_regclass('public.$t') IS NULL THEN 0 ELSE 1 END;\"")
  if [ "$ex" = "1" ]; then
    if [ -n "$EXISTING" ]; then EXISTING="$EXISTING, $t"; else EXISTING="$t"; fi
  else
    echo "SKIP $t"
  fi
done
echo "TRUNCATE $EXISTING"

{
  echo "BEGIN;"
  echo "TRUNCATE TABLE $EXISTING RESTART IDENTITY CASCADE;"
  cat /tmp/wipe_vps_tail.sql
  echo "COMMIT;"
} > /tmp/wipe_vps_dynamic.sql

docker exec -i asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < /tmp/wipe_vps_dynamic.sql

echo AFTER_USERS
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM \"AspNetUsers\";"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT \"Email\" FROM \"AspNetUsers\";"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT r.\"Name\" FROM \"AspNetUserRoles\" ur JOIN \"AspNetUsers\" u ON u.\"Id\"=ur.\"UserId\" JOIN \"AspNetRoles\" r ON r.\"Id\"=ur.\"RoleId\";"'
echo AFTER_OPS
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
sleep 10
docker exec asambleas_web printenv Demo__Enabled
docker exec asambleas_web printenv Demo__SeedUsers

docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM property_horizontals;"'
docker exec asambleas_postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(1) FROM \"AspNetUsers\";"'
echo WIPE_OK