"""Shared config + Supabase helpers."""
import json
import os
import sys

from dotenv import load_dotenv

load_dotenv()

SEASON = int(os.getenv("ESPN_YEAR", "2026"))


def require(*names):
    """Fail early with a clear message instead of half-running."""
    missing = [n for n in names if not os.getenv(n)]
    if missing:
        sys.exit(f"Missing in .env: {', '.join(missing)}")


def supabase_client():
    from supabase import create_client

    require("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def df_to_rows(df, key_map):
    """DataFrame -> rows of {typed key cols..., data: full record as jsonb}.

    key_map maps destination key column -> source column in the dataframe.
    Rows with a null key are dropped; duplicate keys keep the last row
    (Postgres rejects duplicate keys inside a single upsert batch).
    """
    rows = {}
    for rec in json.loads(df.to_json(orient="records", date_format="iso")):
        row = {dest: rec.get(src) for dest, src in key_map.items()}
        if any(v is None for v in row.values()):
            continue
        row["data"] = rec
        rows[tuple(row[k] for k in key_map)] = row
    return list(rows.values())


def upsert(client, table, rows, conflict, chunk=500):
    for i in range(0, len(rows), chunk):
        client.table(table).upsert(rows[i : i + chunk], on_conflict=conflict).execute()
    return len(rows)
