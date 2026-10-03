"""Agent-facing tools. Point an LLM agent at these functions instead of letting it scrape freely.

query_sql connects with a READ-ONLY Postgres role (AGENT_DB_URL), not the service key.
"""
import os
import re

import psycopg
from psycopg.rows import dict_row

from config import SEASON, require

_FORBIDDEN = re.compile(r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do)\b", re.I)

# --- League / scoring configuration (12-team, 0.5 PPR, 1QB/2RB/2WR/1TE/2FLEX) -----------------
MY_TEAM_ID = int(os.getenv("ESPN_MY_TEAM_ID", "0"))
STARTER_SLOTS = {"QB": 1, "RB": 2, "WR": 2, "TE": 1}  # flex is ignored on purpose (see get_waiver_targets)
# Replacement level = the Nth best player at a position by recent production. Roughly: the last
# startable guy in a 12-team league, with flex spots spread across RB/WR.
REPLACEMENT_RANK = {"QB": 12, "RB": 30, "WR": 30, "TE": 14}
# Derayc's call: hype-heavy. Demand (Sleeper adds) outweighs on-field upgrade 65/35.
W_DEMAND, W_VALUE = 0.65, 0.35


def _conn():
    require("AGENT_DB_URL")
    return psycopg.connect(os.environ["AGENT_DB_URL"], row_factory=dict_row, options="-c statement_timeout=10000")


def query_sql(sql: str, params=None, max_rows: int = 200):
    """Run one read-only SELECT/WITH statement. Belt (regex) and braces (read-only role)."""
    s = sql.strip().rstrip(";")
    if ";" in s or not re.match(r"^(select|with)\b", s, re.I) or _FORBIDDEN.search(s):
        raise ValueError("query_sql only accepts a single read-only SELECT/WITH statement")
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(f"select * from ({s}) q limit {int(max_rows)}", params)
        return cur.fetchall()


def get_player_trend(name: str, weeks: int = 5):
    """Last N weeks of half-PPR points for a player (fuzzy name match)."""
    return query_sql(
        """
        select season, week, player_name, position, team, receptions, half_ppr_points
        from v_weekly_half_ppr
        where season = %s and player_name ilike %s
        order by week desc
        limit %s
        """,
        (SEASON, f"%{name}%", weeks),
    )


def get_matchup(team: str):
    """Next unplayed game for a team abbreviation (e.g. 'LAC')."""
    games = query_sql(
        """
        select game_id, week, data->>'gameday' as gameday, data->>'home_team' as home,
               data->>'away_team' as away, data->>'spread_line' as spread_line,
               data->>'total_line' as total_line
        from schedules
        where season = %s and data->>'result' is null
          and (data->>'home_team' = %s or data->>'away_team' = %s)
        order by week
        limit 1
        """,
        (SEASON, team.upper(), team.upper()),
    )
    return games[0] if games else None


# --- Waiver scoring ---------------------------------------------------------------------------
def _production(avg: float, floor: float) -> float:
    """Recent production: half L3 average, half L3 worst game (the floor)."""
    return 0.5 * avg + 0.5 * floor


def _pct_rank(values):
    """0..1 percentile rank of each value within the list (ties share the lower rank)."""
    n = len(values)
    if n <= 1:
        return [1.0] * n
    ordered = sorted(values)
    return [ordered.index(v) / (n - 1) for v in values]


def _recent_production():
    """Every QB/RB/WR/TE with >=2 games in the last 3 played: avg and worst half-PPR game."""
    return query_sql(
        """
        select pl.player_id, pl.full_name, pl.position, pl.team, pl.sleeper_id,
               avg(t.half_ppr_points) as avg_l3, min(t.half_ppr_points) as min_l3
        from (
          select player_id, half_ppr_points,
                 row_number() over (partition by player_id order by week desc) rn
          from v_weekly_half_ppr where season = %s
        ) t
        join players pl on pl.player_id = t.player_id
        where t.rn <= 3 and pl.position in ('QB','RB','WR','TE')
        group by pl.player_id, pl.full_name, pl.position, pl.team, pl.sleeper_id
        having count(*) >= 2
        """,
        (SEASON,),
        max_rows=5000,
    )


def get_waiver_targets(limit: int = 15):
    """Trending adds nobody in your league owns, ranked hype-heavy but position-aware.

    score = 100 * (W_DEMAND * percentile(Sleeper adds) + W_VALUE * percentile(upgrade))

    upgrade = candidate production - max(replacement level at his position,
                                         your weakest starter at that position)
    so a hot WR you don't need scores low on upgrade, while a hot QB is only an upgrade if he
    beats Herbert. Flex is ignored: RB/WR/TE depth beyond the base slots isn't credited.
    Players with <2 recent games have no production sample and are skipped.
    """
    require("ESPN_MY_TEAM_ID")
    prod = {p["player_id"]: p for p in _recent_production()}
    for p in prod.values():
        p["prod"] = _production(float(p["avg_l3"]), float(p["min_l3"]))

    # Replacement level per position.
    replacement = {}
    for pos, rank in REPLACEMENT_RANK.items():
        vals = sorted((p["prod"] for p in prod.values() if p["position"] == pos), reverse=True)
        replacement[pos] = vals[min(rank, len(vals)) - 1] if vals else 0.0

    # League-wide rostered names, and my active (non-IR) players by name.
    roster_rows = query_sql(
        """
        select r.team_id, lower(p->>'name') as name, coalesce(p->>'lineup_slot', '') as slot
        from espn_league_rosters r, jsonb_array_elements(r.data->'players') p
        where r.season = %s
        """,
        (SEASON,),
        max_rows=2000,
    )
    rostered = {r["name"] for r in roster_rows}
    mine = {r["name"] for r in roster_rows if r["team_id"] == MY_TEAM_ID and r["slot"].upper() != "IR"}

    # My weakest starter per position (holes fall back to replacement level).
    my_by_pos = {pos: [] for pos in STARTER_SLOTS}
    for p in prod.values():
        if p["full_name"].lower() in mine:
            my_by_pos[p["position"]].append(p["prod"])
    baseline = {}
    for pos, slots in STARTER_SLOTS.items():
        vals = sorted(my_by_pos[pos], reverse=True)
        weakest = vals[slots - 1] if len(vals) >= slots else 0.0
        baseline[pos] = max(weakest, replacement[pos])

    # Candidates: latest Sleeper "add" pull, unrostered, with a production sample.
    trending = query_sql(
        """
        select sleeper_id, count as adds from sleeper_trending
        where kind = 'add' and pulled_at = (select max(pulled_at) from sleeper_trending)
        """,
        max_rows=500,
    )
    adds_by_sleeper = {t["sleeper_id"]: t["adds"] for t in trending}
    cands = [
        p for p in prod.values()
        if p["sleeper_id"] in adds_by_sleeper and p["full_name"].lower() not in rostered
    ]
    if not cands:
        return []

    demand_pct = _pct_rank([adds_by_sleeper[c["sleeper_id"]] for c in cands])
    upgrades = [c["prod"] - baseline[c["position"]] for c in cands]
    value_pct = _pct_rank(upgrades)

    out = []
    for c, d, u, v in zip(cands, demand_pct, upgrades, value_pct):
        out.append(
            {
                "name": c["full_name"],
                "pos": c["position"],
                "team": c["team"],
                "adds_24h": adds_by_sleeper[c["sleeper_id"]],
                "avg_l3": round(float(c["avg_l3"]), 1),
                "floor_l3": round(float(c["min_l3"]), 1),
                "upgrade_pts": round(u, 1),  # negative = worse than what you'd already start
                "score": round(100 * (W_DEMAND * d + W_VALUE * v), 1),
            }
        )
    return sorted(out, key=lambda r: r["score"], reverse=True)[:limit]
