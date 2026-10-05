"""Deterministic glue: team codes, player resolution, role buckets, and the state sent to Jev.

Everything here is code on purpose. Jev is a text-only classifier: it is weak at counting, dates and
arithmetic, and it must never be the thing that decides which player a news item is about.
"""
from __future__ import annotations

import re

from . import settings

# Canonical = the style used by `schedules` (nflverse): LA, WAS, LV, GB, KC, NE, NO, SF, TB, JAX.
# Verified against the live tables (Oct 2026): ESPN rosters use LAR/WSH; players.team has legacy
# codes (GBP, KCC, NEP, NOS, SFO, TBB, LVR, JAC, RAM, OAK, SDC, STL).
_ALIASES = {
    "WSH": "WAS", "LAR": "LA", "RAM": "LA", "STL": "LA", "GBP": "GB", "KCC": "KC", "NEP": "NE", "NOS": "NO",
    "SFO": "SF", "TBB": "TB", "LVR": "LV", "OAK": "LV", "JAC": "JAX", "SDC": "LAC", "SD": "LAC", "ARZ": "ARI",
}
CANONICAL_TEAMS = frozenset(
    "ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS".split()
)
FREE_AGENT_CODES = frozenset({"FA", "FA*", "", "NONE"})

# ESPN roster slots that are not starting lineup slots.
BENCH_SLOTS = frozenset({"BE", "BN", "BENCH", "IR"})


def canon_team(code) -> str:
    c = str(code or "").strip().upper()
    if c in FREE_AGENT_CODES:
        return "FA"
    return _ALIASES.get(c, c)


def clean_text(text, limit: int = 1500) -> str:
    """Collapse whitespace and cap length: irrelevant state lowers accuracy, and the context is finite."""
    return re.sub(r"\s+", " ", str(text or "")).strip()[:limit]


def resolve_player(rows: list[dict]) -> tuple[dict | None, str]:
    """Pick the one `players` row an ESPN athlete id refers to, or say why we cannot.

    `players.espn_id` is not unique: 4 ids are shared by two players each (profiled Oct 2026), and some of
    those include a current-team player. A fan-out join would silently judge the wrong person, so an id that
    still maps to more than one fantasy-relevant player after preferring rostered players is skipped.
    """
    fantasy = [r for r in rows if r.get("position") in settings.FANTASY_POSITIONS]
    if not fantasy:
        return None, "not_fantasy_position"
    if len(fantasy) > 1:
        rostered = [r for r in fantasy if canon_team(r.get("team")) != "FA"]
        fantasy = rostered or fantasy
    if len(fantasy) > 1:
        return None, "ambiguous_espn_id"
    return fantasy[0], "ok"


# Role buckets turn a recent snap share into WORDS. Jev never sees the number (numeric reasoning is a
# documented weak spot). Cut points are proposals; tune them against how your league talks about roles.
_ROLE_CUTS = {
    "QB": [(0.85, "starting quarterback"), (0.0, "backup quarterback")],
    "RB": [(0.60, "lead running back"), (0.35, "committee running back"), (0.10, "change-of-pace or backup running back"), (0.0, "reserve running back")],
    "WR": [(0.80, "every-down wide receiver"), (0.55, "rotational wide receiver"), (0.20, "depth wide receiver"), (0.0, "reserve wide receiver")],
    "TE": [(0.75, "every-down tight end"), (0.45, "rotational tight end"), (0.15, "depth tight end"), (0.0, "reserve tight end")],
}


def role_bucket(position: str, avg_offense_pct: float | None) -> str:
    """avg_offense_pct is a 0..1 fraction (snap_counts.data->>'offense_pct')."""
    if avg_offense_pct is None or position not in _ROLE_CUTS:
        return "role unknown"
    for cut, label in _ROLE_CUTS[position]:
        if avg_offense_pct >= cut:
            return label
    return "role unknown"


def build_state(player: dict, text: str, source_type: str, baseline_role: str, teammates_out=None) -> dict:
    """The only thing Jev sees. Names, a team code, a role in words, and the (untrusted) item text."""
    state = {
        "player": {
            "name": player["full_name"],
            "team": canon_team(player.get("team")),
            "position": player["position"],
            "baseline_role": baseline_role,
        },
        "item": {"source_type": source_type or "news", "text": clean_text(text)},
    }
    if teammates_out:
        state["context"] = {"teammates_out": list(teammates_out)}
    return state
