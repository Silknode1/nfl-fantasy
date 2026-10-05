"""ESPN public news feed -> Supabase `news_items`. Free, no auth, unofficial endpoint.

Run: python news_ingest.py   (also called by run_nightly.py)
"""
import requests

from config import supabase_client, upsert
from jev_signals.feed import newest_age_hours, parse_articles

ESPN_NEWS = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/news"
STALE_AFTER_HOURS = 48


def run(limit=50):
    c = supabase_client()
    r = requests.get(ESPN_NEWS, params={"limit": limit}, timeout=30)
    r.raise_for_status()
    rows = parse_articles(r.json())
    n = upsert(c, "news_items", rows, "news_id") if rows else 0
    age = newest_age_hours(rows)
    print(f"  news: {n} items" + (f", newest {age:.0f}h old" if age is not None else ""))
    if age is not None and age > STALE_AFTER_HOURS:
        # Not a failure (the offseason is quiet), but a stale feed means Jev has nothing fresh to judge.
        print(f"  news: WARNING newest item is over {STALE_AFTER_HOURS}h old; check the feed before trusting alerts")


if __name__ == "__main__":
    run()
