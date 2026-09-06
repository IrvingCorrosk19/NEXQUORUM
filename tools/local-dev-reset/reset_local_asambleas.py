#!/usr/bin/env python3
"""LOCAL-ONLY transactional reset of ASAMBLEAS operational data.

Keeps president@ocean.demo as PlatformAdmin + structural tenant/org.
Refuses non-loopback hosts and non-allowlisted database names.
"""
from __future__ import annotations

import gzip
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

ROOT = Path(r"c:\Proyectos\NEXQUORUM")
DEV_SETTINGS = ROOT / "src" / "Asambleas.Web" / "appsettings.Development.json"
BACKUP_DIR = ROOT / "tools" / "local-dev-reset" / "backups"
EVIDENCE_DIR = ROOT / "tools" / "local-dev-reset" / "evidence"
PG_DUMP = Path(r"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe")

KEEP_EMAIL = "president@ocean.demo"
PLATFORM_ROLE = "PlatformAdmin"
TENANT_ID = "11111111-1111-1111-1111-111111111101"
ORG_ID = "22222222-2222-2222-2222-222222222201"

ALLOWED_HOSTS = {"127.0.0.1", "localhost", "::1"}
ALLOWED_DBS = {"asambleas"}

OPS_TABLES = [
    "votes",
    "voting_eligibility_snapshots",
    "voting_sessions",
    "motions",
    "agenda_items",
    "speaker_requests",
    "attendance_records",
    "assembly_participants",
    "assembly_representations",
    "quorum_snapshots",
    "assembly_recordings",
    "recording_notice_acceptances",
    "property_recording_policies",
    "survey_responses",
    "survey_questions",
    "survey_forms",
    "communication_delivery_events",
    "communication_deliveries",
    "communication_batches",
    "convocation_recipients",
    "convocations",
    "assembly_access_links",
    "portal_notifications",
    "reminder_rules",
    "message_templates",
    "channel_configurations",
    "communication_profiles",
    "assembly_schedule_changes",
    "assembly_reminder_occurrences",
    "audit_events",
    "powers",
    "ownerships",
    "owner_invitations",
    "owner_password_resets",
    "user_property_memberships",
    "assemblies",
    "units",
    "owners",
    "property_horizontals",
]


def parse_cs(cs: str) -> dict:
    parts = {}
    for p in cs.split(";"):
        if "=" in p:
            k, v = p.split("=", 1)
            parts[k.strip().lower()] = v.strip()
    return parts


def load_cs() -> dict:
    data = json.loads(DEV_SETTINGS.read_text(encoding="utf-8-sig"))
    return parse_cs(data["ConnectionStrings"]["DefaultConnection"])


def gate(parts: dict) -> None:
    host = (parts.get("host") or "").lower()
    db = (parts.get("database") or "").lower()
    if host not in ALLOWED_HOSTS:
        raise SystemExit(f"REFUSED: host '{host}' is not local loopback")
    if db not in ALLOWED_DBS:
        raise SystemExit(f"REFUSED: database '{db}' not allow-listed")
    print(f"GATE_OK host={host} database={db} username={parts.get('username')}")


def connect(parts: dict):
    return psycopg2.connect(
        host=parts["host"],
        port=parts.get("port", "5432"),
        dbname=parts["database"],
        user=parts["username"],
        password=parts["password"],
    )


def counts(cur) -> dict:
    q = {
        "AspNetUsers": 'SELECT count(*) FROM "AspNetUsers"',
        "property_horizontals": "SELECT count(*) FROM property_horizontals",
        "assemblies": "SELECT count(*) FROM assemblies",
        "units": "SELECT count(*) FROM units",
        "owners": "SELECT count(*) FROM owners",
        "votes": "SELECT count(*) FROM votes",
        "tenants": "SELECT count(*) FROM tenants",
        "organizations": "SELECT count(*) FROM organizations",
        "memberships": "SELECT count(*) FROM user_property_memberships",
        "claims_ph": "SELECT count(*) FROM \"AspNetUserClaims\" WHERE \"ClaimType\"='property_horizontal_id'",
    }
    out = {}
    for k, sql in q.items():
        cur.execute(sql)
        out[k] = cur.fetchone()[0]
    return out


def backup(parts: dict) -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    sql_path = BACKUP_DIR / f"asambleas_local_{stamp}.sql"
    env = os.environ.copy()
    env["PGPASSWORD"] = parts.get("password") or ""
    r = subprocess.run(
        [
            str(PG_DUMP),
            "-h",
            parts["host"],
            "-p",
            str(parts.get("port") or "5432"),
            "-U",
            parts["username"],
            "-d",
            parts["database"],
            "--no-owner",
            "--no-acl",
            "-f",
            str(sql_path),
        ],
        capture_output=True,
        text=True,
        env=env,
        timeout=600,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr or "pg_dump failed")
    gz = sql_path.with_suffix(".sql.gz")
    with open(sql_path, "rb") as f_in, gzip.open(gz, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    sql_path.unlink(missing_ok=True)
    print(f"BACKUP_OK path={gz.name} bytes={gz.stat().st_size}")
    return gz


def disable_demo_seed() -> None:
    data = json.loads(DEV_SETTINGS.read_text(encoding="utf-8-sig"))
    demo = data.setdefault("Demo", {})
    demo["Enabled"] = False
    demo["SeedUsers"] = False
    # keep Password key if present but do not print
    DEV_SETTINGS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("DEMO_SEED_DISABLED")


def main() -> int:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    parts = load_cs()
    gate(parts)
    if not PG_DUMP.exists():
        raise SystemExit("pg_dump not found")

    conn = connect(parts)
    conn.autocommit = False
    cur = conn.cursor()

    before = counts(cur)
    print("BEFORE", before)
    (EVIDENCE_DIR / "counts-before.json").write_text(json.dumps(before, indent=2), encoding="utf-8")

    cur.execute('SELECT count(*) FROM "AspNetUsers" WHERE lower("Email")=lower(%s)', (KEEP_EMAIL,))
    keep_n = cur.fetchone()[0]
    if keep_n != 1:
        raise SystemExit(f"REFUSED: keep user {KEEP_EMAIL} count={keep_n}")

    # backup outside transaction (pg_dump)
    bak = backup(parts)
    (EVIDENCE_DIR / "backup-path.txt").write_text(str(bak), encoding="utf-8")

    try:
        trunc = ", ".join(OPS_TABLES)
        cur.execute(f"TRUNCATE TABLE {trunc} RESTART IDENTITY CASCADE")

        cur.execute(
            'DELETE FROM "AspNetUserTokens" WHERE "UserId" NOT IN (SELECT "Id" FROM "AspNetUsers" WHERE lower("Email")=lower(%s))',
            (KEEP_EMAIL,),
        )
        cur.execute(
            'DELETE FROM "AspNetUserLogins" WHERE "UserId" NOT IN (SELECT "Id" FROM "AspNetUsers" WHERE lower("Email")=lower(%s))',
            (KEEP_EMAIL,),
        )
        cur.execute(
            'DELETE FROM "AspNetUserClaims" WHERE "UserId" NOT IN (SELECT "Id" FROM "AspNetUsers" WHERE lower("Email")=lower(%s))',
            (KEEP_EMAIL,),
        )
        cur.execute(
            'DELETE FROM "AspNetUserRoles" WHERE "UserId" NOT IN (SELECT "Id" FROM "AspNetUsers" WHERE lower("Email")=lower(%s))',
            (KEEP_EMAIL,),
        )
        cur.execute('DELETE FROM "AspNetUsers" WHERE lower("Email") <> lower(%s)', (KEEP_EMAIL,))

        # clear PH claims on keep user
        cur.execute(
            '''
            DELETE FROM "AspNetUserClaims" c
            USING "AspNetUsers" u
            WHERE c."UserId"=u."Id" AND lower(u."Email")=lower(%s)
              AND c."ClaimType" = 'property_horizontal_id'
            ''',
            (KEEP_EMAIL,),
        )

        # ensure PlatformAdmin role
        cur.execute(
            'SELECT "Id" FROM "AspNetRoles" WHERE "NormalizedName"=upper(%s)',
            (PLATFORM_ROLE,),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                'INSERT INTO "AspNetRoles" ("Id","Name","NormalizedName","ConcurrencyStamp") VALUES (gen_random_uuid(), %s, upper(%s), gen_random_uuid()::text) RETURNING "Id"',
                (PLATFORM_ROLE, PLATFORM_ROLE),
            )
            role_id = cur.fetchone()[0]
        else:
            role_id = row[0]

        cur.execute(
            'DELETE FROM "AspNetUserRoles" ur USING "AspNetUsers" u WHERE ur."UserId"=u."Id" AND lower(u."Email")=lower(%s)',
            (KEEP_EMAIL,),
        )
        cur.execute(
            'INSERT INTO "AspNetUserRoles" ("UserId","RoleId") SELECT u."Id", %s FROM "AspNetUsers" u WHERE lower(u."Email")=lower(%s)',
            (role_id, KEEP_EMAIL),
        )

        cur.execute(
            'UPDATE "AspNetUsers" SET "DemoRole"=%s, "TenantId"=%s::uuid, "OrganizationId"=%s::uuid WHERE lower("Email")=lower(%s)',
            (PLATFORM_ROLE, TENANT_ID, ORG_ID, KEEP_EMAIL),
        )

        # structural tenant/org only
        cur.execute("DELETE FROM organizations WHERE \"Id\" <> %s::uuid", (ORG_ID,))
        cur.execute("DELETE FROM tenants WHERE \"Id\" <> %s::uuid", (TENANT_ID,))

        cur.execute(
            """
            INSERT INTO tenants ("Id","Code","Name","IsActive","CreatedAtUtc","UpdatedAtUtc")
            SELECT %s::uuid, 'PLATFORM', 'ASAMBLEAS Platform', TRUE, NOW(), NOW()
            WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE "Id"=%s::uuid)
            """,
            (TENANT_ID, TENANT_ID),
        )
        cur.execute(
            """
            INSERT INTO organizations ("Id","TenantId","Name","Code","CreatedAtUtc","UpdatedAtUtc")
            SELECT %s::uuid, %s::uuid, 'ASAMBLEAS Platform Org', 'PLATFORM', NOW(), NOW()
            WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE "Id"=%s::uuid)
            """,
            (ORG_ID, TENANT_ID, ORG_ID),
        )
        cur.execute(
            'UPDATE tenants SET "Code"=%s, "Name"=%s, "IsActive"=TRUE, "UpdatedAtUtc"=NOW() WHERE "Id"=%s::uuid',
            ("PLATFORM", "ASAMBLEAS Platform", TENANT_ID),
        )
        cur.execute(
            'UPDATE organizations SET "Name"=%s, "Code"=%s, "TenantId"=%s::uuid, "UpdatedAtUtc"=NOW() WHERE "Id"=%s::uuid',
            ("ASAMBLEAS Platform Org", "PLATFORM", TENANT_ID, ORG_ID),
        )

        conn.commit()
    except Exception:
        conn.rollback()
        raise

    after = counts(cur)
    print("AFTER", after)
    (EVIDENCE_DIR / "counts-after.json").write_text(json.dumps(after, indent=2), encoding="utf-8")

    cur.execute(
        '''
        SELECT r."Name" FROM "AspNetUserRoles" ur
        JOIN "AspNetUsers" u ON u."Id"=ur."UserId"
        JOIN "AspNetRoles" r ON r."Id"=ur."RoleId"
        WHERE lower(u."Email")=lower(%s)
        ''',
        (KEEP_EMAIL,),
    )
    roles = [r[0] for r in cur.fetchall()]
    print("ROLES", roles)
    (EVIDENCE_DIR / "keep-user-roles.json").write_text(json.dumps(roles, indent=2), encoding="utf-8")

    cur.execute('SELECT "Email" FROM "AspNetUsers" ORDER BY 1')
    users = [r[0] for r in cur.fetchall()]
    print("USERS", users)
    (EVIDENCE_DIR / "users-after.json").write_text(json.dumps(users, indent=2), encoding="utf-8")

    # tables cleaned list
    (EVIDENCE_DIR / "tables-truncated.json").write_text(json.dumps(OPS_TABLES, indent=2), encoding="utf-8")

    conn.close()
    disable_demo_seed()
    print("RESET_OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as ex:
        print("RESET_FAILED", type(ex).__name__, str(ex)[:500])
        raise