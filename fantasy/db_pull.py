"""Pull the Supabase tables the fantasy engine needs, through the REST API (standard library only).

Writes compact JSON to data_cache/db/. Run: python -m fantasy.db_pull
"""
import json
import os
import urllib.parse
import urllib.request

from fantasy.env import CACHE, load_env, need

SEASON = 2026

# name -> (table, select, filters)
PULLS = {
    "weekly": ("weekly_stats",
               "week,player_id,name:data->>player_display_name,pos:data->>position,team:data->>team,"
               "opp:data->>opponent_team,ppr:data->>fantasy_points_ppr,rec:data->>receptions,tgt:data->>targets,"
               "ts:data->>target_share,car:data->>carries,ry:data->>rushing_yards,recy:data->>receiving_yards,"
               "ays:data->>air_yards_share,wopr:data->>wopr,att:data->>attempts,py:data->>passing_yards,"
               "ptd:data->>passing_tds,rtd:data->>rushing_tds,rectd:data->>receiving_tds,headshot:data->>headshot_url",
               {"season": f"eq.{SEASON}"}),
    "snaps": ("snap_counts",
              "week,pfr_id:player_id,name:data->>player,team:data->>team,pos:data->>position,"
              "off_pct:data->>offense_pct,off_snaps:data->>offense_snaps",
              {"season": f"eq.{SEASON}"}),
    "players": ("players", "player_id,espn_id,sleeper_id,full_name,position,team,pfr_id:data->>pfr_id",
                {"espn_id": "not.is.null"}),
    "schedule": ("schedules",
                 "game_id,week,home:data->>home_team,away:data->>away_team,gameday:data->>gameday,"
                 "spread:data->>spread_line,total:data->>total_line,home_score:data->>home_score,away_score:data->>away_score",
                 {"season": f"eq.{SEASON}"}),
    "injuries": ("injuries", "week,gsis:data->>gsis_id,rs:data->>report_status,ps:data->>practice_status",
                 {"season": f"eq.{SEASON}", "data->>position": "in.(QB,RB,WR,TE)"}),
    "trending": ("sleeper_trending", "pulled_at,kind,sleeper_id,count", {"order": "pulled_at.desc"}),
    "jev": ("jev_judgments", "news_id,espn_id,signal,alert_tier,judged_at", {"order": "judged_at.desc"}),
    "news": ("news_items", "news_id,headline,published_at,source,url", {"order": "published_at.desc"}),
}


def _fetch(table: str, select: str, filters: dict) -> list:
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    rows, offset, page = [], 0, 1000
    while True:
        q = {"select": select, "limit": page, "offset": offset, **filters}
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?{urllib.parse.urlencode(q)}",
            # This project's Data API defaults to the `api` schema; our tables live in `public`.
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "public"},
        )
        with urllib.request.urlopen(req, timeout=90) as r:
            batch = json.load(r)
        rows.extend(batch)
        if len(batch) < page:
            return rows
        offset += page


def pull(out_dir=CACHE / "db") -> dict:
    load_env()
    need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {}
    for name, (table, select, filters) in PULLS.items():
        rows = _fetch(table, select, filters)
        (out_dir / f"{name}.json").write_text(json.dumps(rows))
        counts[name] = len(rows)
        print(f"  db {name}: {len(rows)} rows")
    return counts


if __name__ == "__main__":
    print(pull())
