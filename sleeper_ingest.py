"""Sleeper (free, no auth) -> Supabase: trending adds/drops = a live waiver-demand signal."""
from datetime import datetime, timezone

import requests

from config import supabase_client

BASE = "https://api.sleeper.app/v1/players/nfl/trending"


def run(lookback_hours=24, limit=50):
    c = supabase_client()
    pulled_at = datetime.now(timezone.utc).isoformat()  # one timestamp per pull
    total = 0
    for kind in ("add", "drop"):
        r = requests.get(f"{BASE}/{kind}", params={"lookback_hours": lookback_hours, "limit": limit}, timeout=30)
        r.raise_for_status()
        rows = [
            {"pulled_at": pulled_at, "kind": kind, "sleeper_id": str(x["player_id"]), "count": x["count"]}
            for x in r.json()
        ]
        if rows:
            c.table("sleeper_trending").insert(rows).execute()
        total += len(rows)
    print(f"sleeper trending: {total} rows")


if __name__ == "__main__":
    run()
