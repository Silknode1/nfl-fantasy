"""Weekly expected points, shared by the live build and the point-in-time replay.

The rate for a later week is not the rate for this week. ESPN's weekly projection
already prices this week's opponent, so that number must not leak into the rest of
the season and must not be multiplied by our opponent factor a second time.

Prior length differs by position. On the weeks 2–5 scorecard, blending observed
scoring helped running backs and hurt quarterbacks and tight ends, so a back is
pulled toward what he has scored and a quarterback or tight end stays closer to
ESPN. Wide receivers keep the old six-game prior. These lengths are directional,
not a fit: the Tuesday scorecard is what would justify changing them.
"""
from __future__ import annotations

# Games of ESPN prior in (games * ppg + K * espn) / (games + K).
PRIOR_GAMES = {"QB": 10.0, "RB": 4.0, "WR": 6.0, "TE": 10.0}
# The opponent factor moved replay MAE by at most 0.01, so it is clipped tight.
OPP_LO = 0.92
OPP_HI = 1.08


def blend_rate(pos: str, games: int, ppg: float, espn_rate: float) -> float:
    """Points per game when active: observed games plus K games of an ESPN prior."""
    k = PRIOR_GAMES.get(pos, 6.0)
    if games <= 0 and espn_rate <= 0:
        return 0.0
    return (games * ppg + k * espn_rate) / (games + k)


def week_prior(espn_week: float | None, season_rate: float, espn_priced_week: bool) -> float:
    """ESPN prior for the current week. Later weeks use `season_rate` alone.

    60% of ESPN's weekly projection and 40% of the season rate, when ESPN expects
    him to play. A projection of 0.3 or less means ESPN has him off the field, and
    the prior falls back to the season rate.
    """
    if espn_priced_week and espn_week is not None and espn_week > 0.3:
        return 0.6 * float(espn_week) + 0.4 * season_rate
    return season_rate


def defense_factor_clip(factor: float) -> float:
    return min(OPP_HI, max(OPP_LO, factor))


def schedule_projection(
    *,
    pos: str,
    current: int,
    last_week: int,
    gp: int,
    ppg: float,
    espn_week: float | None,
    espn_season: float,
    trend: float,
    jev: float,
    espn_priced_week: bool,
    weeks: list[dict],
) -> dict:
    """Expected points for each supplied week.

    `weeks` entries: week, bye, has_game, opp (unclipped factor), play (chance he
    plays), if_plays (scoring multiplier if he does), actual (set only when this
    week's game is already in the books).

    Returns proj (chance × points if he plays), proj_if, the rest-of-season active
    rate, and play_p for the current week (None when that game is already played).
    `last_week` is accepted so callers can pass the season bound; only `weeks` are projected.
    """
    del last_week  # the caller decides which weeks to send
    season_rate = (espn_season or 0.0) / 17.0
    ros = blend_rate(pos, gp, ppg, season_rate) * trend * jev
    this_week = blend_rate(pos, gp, ppg, week_prior(espn_week, season_rate, espn_priced_week)) * trend * jev
    proj: dict[int, float] = {}
    proj_if: dict[int, float] = {}
    play_p = None
    for w in weeks:
        wk = int(w["week"])
        actual = w.get("actual")
        if actual is not None:
            proj[wk] = proj_if[wk] = round(float(actual), 2)
            continue
        if w.get("bye") or not w.get("has_game"):
            proj[wk] = proj_if[wk] = 0.0
            continue
        is_current = wk == current
        rate = this_week if is_current else ros
        # ESPN's weekly number already includes the opponent. Apply ours only when it does not.
        factor = defense_factor_clip(float(w.get("opp") or 1.0)) if not (is_current and espn_priced_week) else 1.0
        play = float(w.get("play") or 0.0)
        cond = float(w.get("if_plays") if w.get("if_plays") is not None else 1.0)
        if_play = rate * factor * cond
        if play <= 0:
            proj[wk] = proj_if[wk] = 0.0
        else:
            proj[wk] = round(if_play * play, 2)
            proj_if[wk] = round(if_play, 2)
        if is_current:
            play_p = round(play, 2)
    return {
        "proj": proj,
        "proj_if": proj_if,
        "rate": round(ros, 2),
        "play_p": play_p,
        "season_rate": season_rate,
        "week_anchor": week_prior(espn_week, season_rate, espn_priced_week),
    }
