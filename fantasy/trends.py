"""Waiver pulse: who the whole fantasy world is adding and dropping.

Two public sources, no login needed:
  - Sleeper trending adds/drops over several lookback windows (counts across all Sleeper leagues)
  - ESPN's player feed: weekly change in percent rostered across all ESPN leagues

pull() writes data_cache/trends.json; build() shapes it for fantasy.json["trends"].
"""
import json
import urllib.request
from datetime import datetime, timezone

from fantasy.env import CACHE

WINDOWS = {"6h": 6, "12h": 12, "24h": 24, "48h": 48, "3d": 72, "7d": 168}
LIMIT = 30
SLEEPER = "https://api.sleeper.app/v1/players/nfl/trending/{kind}?lookback_hours={hours}&limit={limit}"
ESPN = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leaguedefaults/3?view=kona_player_info"
ESPN_POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}
ESPN_TEAM = {0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN",
             11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ",
             21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX",
             33: "BAL", 34: "HOU"}
OUT = CACHE / "trends.json"


def _get(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": "nfl-fantasy", **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def pull(season: int) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sleeper = {w: {k: _get(SLEEPER.format(kind=k, hours=h, limit=LIMIT + 10)) for k in ("add", "drop")} for w, h in WINDOWS.items()}
    espn = {}
    for kind, asc in (("add", False), ("drop", True)):
        filt = {"players": {"limit": LIMIT + 10, "sortPercChanged": {"sortAsc": asc, "sortPriority": 1},
                            "filterSlotIds": {"value": [0, 2, 4, 6, 23, 16, 17]}}}
        espn[kind] = _get(ESPN.format(season=season), {"x-fantasy-filter": json.dumps(filt)}).get("players", [])
    OUT.write_text(json.dumps({"pulledAt": now, "sleeper": sleeper, "espn": espn}))
    print(f"  trends: sleeper {len(WINDOWS)} windows, espn {sum(len(v) for v in espn.values())} movers")


def build() -> dict | None:
    if not OUT.exists():
        return None
    raw = json.loads(OUT.read_text())
    try:
        players = json.loads((CACHE / "db" / "players.json").read_text())
    except FileNotFoundError:
        players = []
    by_sleeper = {str(p["sleeper_id"]): p for p in players if p.get("sleeper_id")}

    def sleeper_row(t: dict, rank: int) -> dict | None:
        sid = str(t["player_id"])
        if sid.isalpha():  # team defenses are keyed by their abbreviation
            return {"rank": rank, "id": None, "name": f"{sid} D/ST", "pos": "DST", "team": sid, "count": t["count"]}
        p = by_sleeper.get(sid)
        if not p:
            return None
        pos = {"DEF": "DST", "PK": "K"}.get(p.get("position"), p.get("position") or "?")
        return {"rank": rank, "id": str(p["espn_id"]) if p.get("espn_id") else None, "name": p["full_name"], "pos": pos,
                "team": p.get("team") or "FA", "count": t["count"]}

    sleeper = {}
    for w, kinds in raw["sleeper"].items():
        sleeper[w] = {}
        for k, rows in kinds.items():
            out = [r for r in (sleeper_row(t, i) for i, t in enumerate(rows, 1)) if r]
            for i, r in enumerate(out, 1):
                r["rank"] = i
            sleeper[w][k] = out[:LIMIT]

    espn = {}
    for k, rows in raw["espn"].items():
        out = []
        for e in rows:
            pl = e.get("player", e)
            o = pl.get("ownership") or {}
            out.append({"rank": len(out) + 1, "id": str(pl["id"]), "name": pl.get("fullName"),
                        "pos": ESPN_POS.get(pl.get("defaultPositionId"), "?"), "team": ESPN_TEAM.get(pl.get("proTeamId"), "?"),
                        "change": round(o.get("percentChange", 0), 2), "rostered": round(o.get("percentOwned", 0), 1),
                        "started": round(o.get("percentStarted", 0), 1), "inj": (pl.get("injuryStatus") or "").replace("ACTIVE", "")})
        espn[k] = out[:LIMIT]
    return {"pulledAt": raw["pulledAt"], "windows": list(WINDOWS), "sleeper": sleeper, "espn": espn}
