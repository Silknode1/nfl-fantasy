"""One command for the fantasy screens: pull ESPN + Supabase, project, publish.

  python -m fantasy.build            # pull everything, write web/public/data/fantasy.json, save to Supabase
  python -m fantasy.build --offline  # re-run projections on the cached pulls only

Also refreshes the espn_league_rosters table straight from the ESPN API, so the agent tools stop
reading a stale roster when the espn-api package fails.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

from fantasy import db_pull, engine, espn_league, history, trends
from fantasy.env import CACHE, ROOT, load_env

SLOTS = engine.SLOTS
POS = engine.POS


def _post(table: str, rows: list, conflict: str) -> None:
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        f"{url}/rest/v1/{table}?on_conflict={conflict}",
        data=json.dumps(rows).encode(),
        method="POST",
        headers={
            "apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
            "Content-Profile": "public", "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    urllib.request.urlopen(req, timeout=90).read()


def save_rosters(league: dict, season: int) -> int:
    rows = []
    for t in league["teams"]:
        players = []
        for e in t["roster"]["entries"]:
            p = e["playerPoolEntry"]["player"]
            players.append({
                "name": p["fullName"], "espn_id": p["id"], "position": POS.get(p.get("defaultPositionId")),
                "pro_team": engine.PRO.get(p.get("proTeamId")), "injury_status": p.get("injuryStatus"),
                "lineup_slot": SLOTS.get(e["lineupSlotId"], str(e["lineupSlotId"])),
                "points": e["playerPoolEntry"].get("appliedStatTotal"),
            })
        rows.append({"season": season, "team_id": t["id"], "team_name": t["name"].strip(), "data": {"players": players},
                     "pulled_at": datetime.now(timezone.utc).isoformat()})
    _post("espn_league_rosters", rows, "season,team_id")
    return len(rows)


def save_snapshot(data: dict) -> None:
    _post("fantasy_snapshots", [{"generated_at": data["meta"]["generatedAt"], "season": data["meta"]["season"],
                                 "week": data["meta"]["week"], "data": data}], "generated_at")


def run(offline: bool = False) -> None:
    load_env()
    if not offline:
        espn_league.pull()
        db_pull.pull()
    data = engine.build()
    try:  # waiver pulse is a nice-to-have: a failed pull keeps the last cached copy
        if not offline:
            trends.pull(data["meta"]["season"])
        t = trends.build()
        if t:
            data["trends"] = t
    except Exception as e:
        print(f"  trends: FAILED ({type(e).__name__}: {e})")
    dest = ROOT / "web" / "public" / "data" / "fantasy.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, separators=(",", ":")))
    print(f"  fantasy: wrote {dest.relative_to(ROOT)} ({len(data['players'])} players, week {data['meta']['week']})")
    if offline or not os.getenv("SUPABASE_URL"):
        return
    league = json.loads((CACHE / "espn" / "league.json").read_text())
    steps = (("rosters", lambda: save_rosters(league, data["meta"]["season"])), ("snapshot", lambda: save_snapshot(data)),
             ("transactions log", lambda: history.log_transactions(history.pull_transactions(data["meta"]["week"]))),
             ("projections log", lambda: history.log_projections(data)))
    for label, fn in steps:
        try:
            out = fn()
            print(f"  fantasy {label}: saved{f' ({out} rows)' if out else ''}")
        except Exception as e:  # a storage hiccup shouldn't lose the local file
            print(f"  fantasy {label}: FAILED ({type(e).__name__}: {e})")


if __name__ == "__main__":
    run(offline="--offline" in sys.argv)
