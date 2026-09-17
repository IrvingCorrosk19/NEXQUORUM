"""Create isolated asambleas_e2e_cert DB from ASAMBLEAS_TEST_CONNECTION. No secrets printed."""
import os, re, sys
cs = os.environ.get("ASAMBLEAS_TEST_CONNECTION", "").strip()
if not cs:
    print("FAIL: ASAMBLEAS_TEST_CONNECTION missing", file=sys.stderr); sys.exit(1)
def pick(key):
    m = re.search(rf"{key}=([^;]+)", cs, re.I)
    if not m: raise SystemExit(f"FAIL: {key} missing")
    return m.group(1)
host, port, user, pwd = pick("Host"), pick("Port"), pick("Username"), pick("Password")
print(f"host={host} port={port} user={user} pwd_len={len(pwd)}")
try:
    import psycopg2
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
    import psycopg2
conn = psycopg2.connect(host=host, port=port, user=user, password=pwd, dbname="postgres")
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT datname FROM pg_database WHERE datname LIKE 'asambleas%' ORDER BY 1")
print("dbs=", [r[0] for r in cur.fetchall()])
target = "asambleas_e2e_cert"
cur.execute("SELECT 1 FROM pg_database WHERE datname=%s", (target,))
if not cur.fetchone():
    cur.execute('CREATE DATABASE "' + target + '"')
    print("CREATED", target)
else:
    print("EXISTS", target)
cur.close(); conn.close(); print("OK")
