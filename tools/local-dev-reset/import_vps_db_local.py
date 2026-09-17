#!/usr/bin/env python3
"""Import a VPS pg_dump into local Development DB. Requires explicit intent."""
from __future__ import annotations

import gzip
import os
import shutil
import subprocess
import sys
from pathlib import Path

import psycopg2

PW = "Panama2020$"
HOST = "127.0.0.1"
PORT = 5432
DB = "asambleas"
USER = "postgres"

DUMP_GZ = Path(os.environ.get("VPS_DUMP_GZ", r"C:\Users\irvin\AppData\Local\Temp\asambleas_vps_to_local.sql.gz"))
BACKUP_DIR = Path(r"c:\Proyectos\NEXQUORUM\.local\db-backups")
DUMP_SQL = Path(os.environ.get("TEMP", ".")) / "asambleas_vps_to_local.sql"


def find_pg_bin() -> Path | None:
    for ver in ("17", "16", "15", "14", "18"):
        p = Path(rf"C:\Program Files\PostgreSQL\{ver}\bin")
        if (p / "psql.exe").exists():
            return p
    return None


def main() -> int:
    if not DUMP_GZ.exists():
        print("missing dump", DUMP_GZ)
        return 1

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(DUMP_GZ, "rb") as f_in, open(DUMP_SQL, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    print("sql", DUMP_SQL, DUMP_SQL.stat().st_size)

    env = os.environ.copy()
    env["PGPASSWORD"] = PW
    bin_dir = find_pg_bin()
    print("pg bin", bin_dir)

    conn = psycopg2.connect(host=HOST, port=PORT, dbname=DB, user=USER, password=PW)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
    print("local public tables before", cur.fetchone()[0])
    conn.close()

    if not bin_dir:
        print("NO_PG_BIN — install PostgreSQL client tools or add to PATH")
        return 2

    pg_dump = str(bin_dir / "pg_dump.exe")
    psql = str(bin_dir / "psql.exe")
    backup = BACKUP_DIR / "local_before_vps_import.sql"
    subprocess.check_call(
        [pg_dump, "-h", HOST, "-U", USER, "-d", DB, "--no-owner", "--no-acl", "-f", str(backup)],
        env=env,
    )
    print("backed up", backup, backup.stat().st_size)

    subprocess.check_call(
        [
            psql,
            "-h",
            HOST,
            "-U",
            USER,
            "-d",
            "postgres",
            "-c",
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='asambleas' AND pid <> pg_backend_pid();",
        ],
        env=env,
    )
    subprocess.check_call(
        [psql, "-h", HOST, "-U", USER, "-d", "postgres", "-c", "DROP DATABASE IF EXISTS asambleas;"],
        env=env,
    )
    subprocess.check_call(
        [psql, "-h", HOST, "-U", USER, "-d", "postgres", "-c", "CREATE DATABASE asambleas OWNER postgres;"],
        env=env,
    )
    subprocess.check_call(
        [psql, "-h", HOST, "-U", USER, "-d", DB, "-v", "ON_ERROR_STOP=1", "-f", str(DUMP_SQL)],
        env=env,
    )

    conn = psycopg2.connect(host=HOST, port=PORT, dbname=DB, user=USER, password=PW)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM assemblies")
    assemblies = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM owners")
    owners = cur.fetchone()[0]
    cur.execute(
        "SELECT \"Channel\"::text, \"ProviderType\"::text, \"IsEnabled\", \"HasSecret\" FROM channel_configurations WHERE \"Channel\"::text='Email'"
    )
    email_cfg = cur.fetchall()
    conn.close()
    print("RESTORE_OK assemblies=", assemblies, "owners=", owners, "email=", email_cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
