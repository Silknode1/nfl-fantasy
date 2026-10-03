"""The Odds API (free tier ~500 req/mo) -> Supabase. Implied totals predict fantasy output well."""
import os
from datetime import datetime, timezone

import requests

from config import supabase_client

URL = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds"


def run():
    key = os.getenv("ODDS_API_KEY")
    if not key:
        print("odds: skipped (ODDS_API_KEY not set)")
        return
    r = requests.get(URL, params={"apiKey": key, "regions": "us", "markets": "totals,spreads"}, timeout=30)
    r.raise_for_status()
    pulled_at = datetime.now(timezone.utc).isoformat()
    c = supabase_client()
    rows = []
    for ev in r.json():
        for market in ("totals", "spreads"):
            books = [
                {"book": b["key"], "outcomes": m["outcomes"]}
                for b in ev.get("bookmakers", [])
                for m in b.get("markets", [])
                if m["key"] == market
            ]
            rows.append(
                {
                    "event_id": ev["id"],
                    "market": market,
                    "pulled_at": pulled_at,
                    "data": {
                        "home": ev["home_team"],
                        "away": ev["away_team"],
                        "commence": ev["commence_time"],
                        "books": books,
                    },
                }
            )
    if rows:
        c.table("odds").insert(rows).execute()
    print(f"odds: {len(rows)} rows (requests remaining: {r.headers.get('x-requests-remaining')})")


if __name__ == "__main__":
    run()
