"""ESPN -> Supabase.

1. Public scoreboard JSON (unofficial, undocumented, no auth) for live scores.
2. Your private league rosters via espn-api, using your own espn_s2 / SWID cookies.
"""
import os

import requests

from config import SEASON, supabase_client, upsert

SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"


def scoreboard(c):
    r = requests.get(SCOREBOARD, timeout=30)
    r.raise_for_status()
    j = r.json()
    season = j.get("season", {}).get("year", SEASON)
    week = j.get("week", {}).get("number")
    rows = [{"event_id": e["id"], "season": season, "week": week, "data": e} for e in j.get("events", [])]
    return upsert(c, "espn_scoreboard", rows, "event_id")


def league_rosters(c):
    if not (os.getenv("ESPN_S2") and os.getenv("ESPN_SWID")):
        print("  espn league: skipped (ESPN_S2 / ESPN_SWID not set in .env)")
        return 0
    from espn_api.football import League

    league = League(
        league_id=int(os.environ["ESPN_LEAGUE_ID"]),
        year=SEASON,
        espn_s2=os.environ["ESPN_S2"],
        swid=os.environ["ESPN_SWID"],
    )
    rows = []
    for t in league.teams:
        players = [
            {
                "name": p.name,
                "espn_id": getattr(p, "playerId", None),
                "position": getattr(p, "position", None),
                "pro_team": getattr(p, "proTeam", None),
                "injury_status": getattr(p, "injuryStatus", None),
                "lineup_slot": getattr(p, "lineupSlot", None),
                "points": getattr(p, "total_points", None),
                "projected": getattr(p, "projected_total_points", None),
            }
            for p in t.roster
        ]
        rows.append({"season": SEASON, "team_id": t.team_id, "team_name": t.team_name, "data": {"players": players}})
    return upsert(c, "espn_league_rosters", rows, "season,team_id")


def run():
    c = supabase_client()
    for label, fn in (("scoreboard", scoreboard), ("league rosters", league_rosters)):
        try:
            print(f"  espn {label}: {fn(c)} rows")
        except Exception as e:
            print(f"  espn {label}: FAILED ({type(e).__name__}: {e})")
            if "401" in str(e):
                print("    -> ESPN cookies likely expired; re-grab espn_s2 and SWID from Chrome")


if __name__ == "__main__":
    run()
