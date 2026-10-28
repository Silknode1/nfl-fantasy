"""Weekly expected points: position prior, this-week vs rest-of-season, bye, availability, opponent."""
from fantasy.history import replay
from fantasy.project import (
    PRIOR_GAMES,
    blend_rate,
    defense_factor_clip,
    schedule_projection,
    week_prior,
)


def test_running_back_trusts_observed_scoring_more_than_quarterback():
    # Same games, same scoring, same ESPN rate. The weeks 2-5 scorecard found that
    # mixing in observed points helped RBs and hurt QBs, so the RB blend sits closer to what he scored.
    rb = blend_rate("RB", games=4, ppg=18.0, espn_rate=10.0)
    qb = blend_rate("QB", games=4, ppg=18.0, espn_rate=10.0)
    assert rb == 14.0
    assert abs(qb - (4 * 18 + PRIOR_GAMES["QB"] * 10) / (4 + PRIOR_GAMES["QB"])) < 1e-9
    assert abs(rb - 18) < abs(qb - 18)
    assert PRIOR_GAMES["TE"] > PRIOR_GAMES["WR"] == 6


def test_this_week_prior_includes_espn_week_and_rest_of_season_does_not():
    assert week_prior(20.0, season_rate=10.0, espn_priced_week=True) == 16.0
    assert week_prior(20.0, season_rate=10.0, espn_priced_week=False) == 10.0
    assert week_prior(0.2, season_rate=10.0, espn_priced_week=True) == 10.0


def test_schedule_keeps_this_weeks_matchup_out_of_later_weeks():
    # ESPN says 20 this week (a soft matchup). Season rate is 10. A later week against a
    # league-average defense must use the season blend, not the 20.
    out = schedule_projection(
        pos="WR",
        current=6,
        last_week=7,
        gp=4,
        ppg=10.0,
        espn_week=20.0,
        espn_season=170.0,  # 10 per game
        trend=1.0,
        jev=1.0,
        espn_priced_week=True,
        weeks=[
            {"week": 6, "bye": False, "has_game": True, "opp": 1.2, "play": 1.0, "if_plays": 1.0, "actual": None},
            {"week": 7, "bye": False, "has_game": True, "opp": 1.0, "play": 1.0, "if_plays": 1.0, "actual": None},
        ],
    )
    # Current week: 0.6*20 + 0.4*10 = 16, blended with 4 games at 10 and WR prior of 6.
    # (4*10 + 6*16) / 10 = 13.6, and the 1.2 opponent factor is not applied again.
    assert out["proj"][6] == 13.6
    # Later week: season rate 10 blended with ppg 10 stays 10. Opponent 1.0.
    assert out["proj"][7] == 10.0
    assert out["rate"] == 10.0


def test_current_week_does_not_reapply_opponent_when_espn_priced_the_matchup():
    out = schedule_projection(
        pos="RB",
        current=6,
        last_week=6,
        gp=0,
        ppg=0.0,
        espn_week=12.0,
        espn_season=170.0,
        trend=1.0,
        jev=1.0,
        espn_priced_week=True,
        weeks=[{"week": 6, "bye": False, "has_game": True, "opp": 1.2, "play": 1.0, "if_plays": 1.0, "actual": None}],
    )
    # No games played, so the rate is the ESPN week prior: 0.6*12 + 0.4*(170/17) = 11.2.
    assert out["proj"][6] == 11.2
    assert out["proj_if"][6] == 11.2


def test_future_week_applies_clipped_opponent_to_the_season_rate():
    out = schedule_projection(
        pos="WR",
        current=6,
        last_week=7,
        gp=0,
        ppg=0.0,
        espn_week=20.0,
        espn_season=170.0,
        trend=1.0,
        jev=1.0,
        espn_priced_week=True,
        weeks=[{"week": 7, "bye": False, "has_game": True, "opp": 1.2, "play": 1.0, "if_plays": 1.0, "actual": None}],
    )
    # Season rate 10, no games, opponent 1.2 clips to +8%.
    assert out["proj"][7] == 10.8


def test_bye_and_missing_game_project_zero():
    out = schedule_projection(
        pos="QB",
        current=6,
        last_week=8,
        gp=5,
        ppg=18.0,
        espn_week=18.0,
        espn_season=300.0,
        trend=1.0,
        jev=1.0,
        espn_priced_week=True,
        weeks=[
            {"week": 6, "bye": True, "has_game": False, "opp": 1.0, "play": 0.97, "if_plays": 1.0, "actual": None},
            {"week": 7, "bye": False, "has_game": False, "opp": 1.0, "play": 0.97, "if_plays": 1.0, "actual": None},
        ],
    )
    assert out["proj"][6] == 0.0
    assert out["proj"][7] == 0.0
    assert out["proj_if"][6] == 0.0


def test_questionable_expected_points_are_chance_times_points_if_he_plays():
    out = schedule_projection(
        pos="WR",
        current=6,
        last_week=6,
        gp=0,
        ppg=0.0,
        espn_week=10.0,
        espn_season=170.0,
        trend=1.0,
        jev=1.0,
        espn_priced_week=True,
        weeks=[{"week": 6, "bye": False, "has_game": True, "opp": 1.1, "play": 0.63, "if_plays": 0.88, "actual": None}],
    )
    # Week prior = 0.6*10 + 0.4*10 = 10. Expected = 10 * 0.63 * 0.88. If he plays = 10 * 0.88.
    assert out["proj"][6] == round(10 * 0.63 * 0.88, 2)
    assert out["proj_if"][6] == round(10 * 0.88, 2)
    assert out["play_p"] == 0.63


def test_ruled_out_player_projects_zero_even_if_a_rate_exists():
    out = schedule_projection(
        pos="RB",
        current=6,
        last_week=6,
        gp=4,
        ppg=14.0,
        espn_week=0.0,
        espn_season=200.0,
        trend=1.0,
        jev=1.0,
        espn_priced_week=False,
        weeks=[{"week": 6, "bye": False, "has_game": True, "opp": 1.05, "play": 0.0, "if_plays": 1.0, "actual": None}],
    )
    assert out["proj"][6] == 0.0
    assert out["proj_if"][6] == 0.0


def test_already_played_week_keeps_the_projection_separate_from_the_actual():
    out = schedule_projection(
        pos="QB",
        current=6,
        last_week=6,
        gp=5,
        ppg=18.0,
        espn_week=18.0,
        espn_season=300.0,
        trend=1.0,
        jev=1.0,
        espn_priced_week=True,
        weeks=[{"week": 6, "bye": False, "has_game": True, "opp": 0.9, "play": 0.97, "if_plays": 1.0, "actual": 22.4}],
    )
    # Season rate 300/17. Week prior 0.6*18 + 0.4*that. QB prior is 10 games.
    # The 22.4 actual is not the projection, and the 0.9 opponent factor is not applied.
    season_rate = 300.0 / 17.0
    anchor = 0.6 * 18.0 + 0.4 * season_rate
    rate = (5 * 18.0 + 10 * anchor) / 15
    assert out["proj"][6] == round(rate * 0.97, 2)
    assert out["proj_if"][6] == round(rate, 2)
    assert out["proj"][6] != 22.4
    assert out["play_p"] is None


def test_weekly_points_do_not_fall_below_the_floor():
    out = schedule_projection(
        pos="QB",
        current=8,
        last_week=8,
        gp=4,
        ppg=-0.5,
        espn_week=0.0,
        espn_season=0.0,
        trend=1.0,
        jev=1.0,
        espn_priced_week=False,
        weeks=[{"week": 8, "bye": False, "has_game": True, "opp": 0.92, "play": 0.97, "if_plays": 1.0, "actual": None}],
    )
    # The blend itself can be negative. The week that would be shown as expected points cannot.
    assert out["rate"] < 0
    assert out["proj"][8] == 0.0
    assert out["proj_if"][8] == 0.0


def test_opponent_factor_clips_at_eight_percent():
    assert defense_factor_clip(1.4) == 1.08
    assert defense_factor_clip(0.6) == 0.92
    assert defense_factor_clip(1.03) == 1.03


def test_defense_table_clips_at_eight_percent():
    from fantasy.engine import defense_factors

    weekly = []
    for w in range(1, 17):
        weekly.append({"pos": "WR", "opp": "AAA", "ppr": 40, "rec": 0, "week": w})
        weekly.append({"pos": "WR", "opp": "BBB", "ppr": 10, "rec": 0, "week": w})
    fac = defense_factors(weekly)
    assert fac["AAA"]["WR"] == 1.08
    assert fac["BBB"]["WR"] == 0.92


def test_separate_played_week_restores_the_pregame_projection_and_leaves_the_actual():
    from fantasy.engine import separate_played_projections

    player = {
        "id": "1", "name": "Runner", "pos": "RB", "nfl": "BUF", "teamId": 1,
        "inj": "ACTIVE", "bye": 12, "gp": 4, "ppg": 10.0, "espnWeek": 12.0,
        "rate": 10.0, "locked": True, "playP": None, "sd": 4.0,
        "rateParts": {"espn": 10.0, "season": 10.0, "trend": 1.0, "jev": 1.0, "week": 11.2, "k": 4.0},
        "actual": {"6": 22.0},
        "proj": {"6": 22.0, "7": 10.8},
        "projIf": {"6": 22.0, "7": 11.25},
        "ros": 10.8, "playoffs": 0.0, "ourRank": 1,
    }
    data = {
        "meta": {"week": 6, "regularWeeks": 14, "lastWeek": 17},
        "defense": {"MIA": {"RB": 1.2}},
        "nflOpp": {"BUF": {"6": "MIA", "7": "MIA"}},
        "players": [player],
    }
    assert separate_played_projections(data) == 1
    # ESPN priced the week (12 > 0.3, active), so the 1.2 factor is not applied.
    # RB prior 4: (4*10 + 4*11.2) / 8 = 10.6, times 0.96 play chance.
    assert player["proj"]["6"] == round(10.6 * 0.96, 2)
    assert player["projIf"]["6"] == 10.6
    assert player["actual"]["6"] == 22.0
    assert player["proj"]["6"] != player["actual"]["6"]
    # The vendor ESPN week stays 12. It is not replaced by the actual or by the restored blend.
    assert player["espnWeek"] == 12.0
    assert player["proj"]["7"] == 10.8


def test_espn_weekly_value_is_restored_when_the_blend_overwrote_it():
    from fantasy.engine import separate_played_projections

    # Anchor 11.2 is 0.6 * 12 + 0.4 * 10, so the vendor week is 12.
    # The stored espnWeek was replaced by the app projection (10.2).
    player = {
        "id": "1", "name": "Runner", "pos": "RB", "nfl": "BUF", "teamId": 1,
        "inj": "ACTIVE", "bye": 12, "gp": 4, "ppg": 10.0, "espnWeek": 10.2,
        "rate": 10.0, "locked": False, "playP": 0.96, "sd": 4.0,
        "rateParts": {"espn": 10.0, "season": 10.0, "trend": 1.0, "jev": 1.0, "week": 11.2, "k": 4.0},
        "actual": {},
        "proj": {"6": 10.18, "7": 10.8},
        "projIf": {"6": 10.6, "7": 11.25},
        "ros": 10.8, "playoffs": 0.0, "ourRank": 1,
    }
    data = {
        "meta": {"week": 6, "regularWeeks": 14, "lastWeek": 17},
        "defense": {"MIA": {"RB": 1.0}},
        "nflOpp": {"BUF": {"6": "MIA", "7": "MIA"}},
        "players": [player],
    }
    assert separate_played_projections(data) == 0
    assert player["espnWeek"] == 12.0
    assert player["proj"]["6"] == 10.18
    assert player["actual"] == {}


def test_separate_played_week_floors_a_negative_week_and_a_negative_spread():
    from fantasy.engine import separate_played_projections

    player = {
        "id": "9", "name": "Backup", "pos": "QB", "nfl": "MIA", "teamId": 0,
        "inj": "ACTIVE", "bye": 11, "gp": 4, "ppg": -0.25, "espnWeek": 0.0,
        "rate": -0.07, "locked": False, "playP": 0.97, "sd": -0.16,
        "rateParts": {"espn": 0.0, "season": -0.25, "trend": 1.0, "jev": 1.0, "week": 0.0, "k": 10.0},
        "actual": {},
        "proj": {"8": -0.06, "9": -0.07},
        "projIf": {"8": -0.06, "9": -0.07},
        "ros": -0.1, "playoffs": 0.0, "ourRank": 1,
    }
    data = {
        "meta": {"week": 7, "regularWeeks": 14, "lastWeek": 17},
        "defense": {},
        "nflOpp": {"MIA": {"8": "BUF", "9": "NYJ"}},
        "players": [player],
    }
    assert separate_played_projections(data) == 0
    assert player["proj"]["8"] == 0.0
    assert player["proj"]["9"] == 0.0
    assert player["sd"] == 0.0
    assert player["rate"] == -0.07


def test_replay_uses_the_position_prior_and_does_not_reapply_opponent(monkeypatch):
    monkeypatch.setattr("fantasy.history.E.defense_factors", lambda weekly: {"MIA": {"RB": 1.2}})
    monkeypatch.setattr("fantasy.history.E.usage", lambda weekly, snaps, players: {})
    ctx = {
        "weekly": [{"week": 1}],
        "snaps": [],
        "plist": [],
        "jev": [],
        "news": [],
        "opp": {("BUF", 5): "MIA"},
        "byes": {"BUF": 12},
        "espn_to_gsis": {},
        "allp": [{
            "player": {
                "id": 1,
                "fullName": "Runner",
                "defaultPositionId": 2,
                "proTeamId": 2,
                "stats": [],
            }
        }],
        "weeks": {"1": {"actual": {"1": 20, "2": 20, "3": 20, "4": 20}, "proj": {"5": 10}}},
    }
    out = replay(5, 0.0, ctx)
    # season_mix 0 → season rate is the point-in-time weekly average (10). RB prior is 4 games.
    # (4*20 + 4*10) / 8 = 15. The 1.2 defense factor must not be applied on top of ESPN's week.
    assert out["1"]["proj"] == 15.0
    assert out["1"]["parts"]["opp"] == 1.0
