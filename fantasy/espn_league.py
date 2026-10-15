"""Pull the private ESPN league views the fantasy screens need.

Uses your own espn_s2 / SWID cookies (read-only). Writes raw JSON to data_cache/espn/.
Run: python -m fantasy.espn_league
"""
import json
import os
import urllib.request

from fantasy.env import CACHE, load_env, need

BASE = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{league}"

# view name -> (query string, optional x-fantasy-filter)
def _views(period: int) -> dict:
    stats = {"value": 5, "additionalValue": [f"00{SEASON}", f"10{SEASON}", f"00{SEASON - 1}", f"11{SEASON}{period}"]}
    return {
        "league": ("view=mTeam&view=mRoster&view=mSettings&view=mStatus&view=mStandings&view=mPendingTransactions", None),
        "matchups": ("view=mMatchupScore&view=mMatchup&view=mScoreboard", None),
        "positional": ("view=mPositionalRatings", None),
        "transactions": ("view=mTransactions2", None),
        # Every relevant player (rostered or not): weekly actuals, ESPN projections, ranks, ownership.
        "allplayers": (
            f"view=kona_player_info&scoringPeriodId={period}",
            {"players": {
                "filterSlotIds": {"value": [0, 2, 4, 6]},
                "limit": 700,
                "sortPercOwned": {"sortPriority": 1, "sortAsc": False},
                "filterRanksForScoringPeriodIds": {"value": [period]},
                "filterRanksForRankTypes": {"value": ["PPR", "STANDARD"]},
                "filterStatsForTopScoringPeriodIds": stats,
            }},
        ),
        # League-specific free agents and players on waivers.
        "fa": (
            f"view=kona_player_info&scoringPeriodId={period}",
            {"players": {
                "filterStatus": {"value": ["FREEAGENT", "WAIVERS"]},
                "filterSlotIds": {"value": [0, 2, 4, 6]},
                "limit": 400,
                "sortPercOwned": {"sortPriority": 1, "sortAsc": False},
                "filterStatsForTopScoringPeriodIds": stats,
            }},
        ),
    }


SEASON = int(os.getenv("ESPN_YEAR") or 2026)


def _get(url: str, cookie: str, filt: dict | None) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (nfl-fantasy personal app)", "Cookie": cookie})
    if filt:
        req.add_header("x-fantasy-filter", json.dumps(filt))
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def current_period(cookie: str, base: str) -> int:
    status = _get(f"{base}?view=mStatus", cookie, None)
    return int(status.get("scoringPeriodId") or status.get("status", {}).get("currentMatchupPeriod") or 1)


def pull(out_dir=CACHE / "espn") -> dict:
    load_env()
    need("ESPN_LEAGUE_ID", "ESPN_S2", "ESPN_SWID")
    global SEASON
    SEASON = int(os.getenv("ESPN_YEAR") or 2026)
    base = BASE.format(season=SEASON, league=os.environ["ESPN_LEAGUE_ID"])
    cookie = f"espn_s2={os.environ['ESPN_S2']}; SWID={os.environ['ESPN_SWID']}"
    period = current_period(cookie, base)
    out_dir.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for name, (query, filt) in _views(period).items():
        data = _get(f"{base}?{query}", cookie, filt)
        (out_dir / f"{name}.json").write_text(json.dumps(data))
        sizes[name] = len(json.dumps(data))
        print(f"  espn {name}: {sizes[name]:,} bytes")
    return {"period": period, "sizes": sizes}


if __name__ == "__main__":
    print(pull())
