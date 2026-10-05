import pytest

from jev_signals import signals
from jev_signals.client import ChoiceResult, JevAnswers, ScoreResult
from jev_signals.signals import interpret, route_alert


def _choice(options, pick, p):
    n = len(options)
    rest = (1 - p) / (n - 1)
    return ChoiceResult(pick, (p - 1 / n) / (1 - 1 / n), {o: (p if o == pick else rest) for o in options})


def _score(levels, level, p=0.9):
    rest = (1 - p) / (levels - 1)
    probs = {i: (p if i == level else rest) for i in range(levels)}
    return ScoreResult(sum(i * q for i, q in probs.items()), (p - 1 / levels) / (1 - 1 / levels), probs)


AVAIL = ("out", "doubtful", "questionable", "limited_expected", "full", "no_status")


def answers(**over):
    base = dict(
        nouls={"about_player": 0.95, "injection_suspect": 0.02, "role_expands": 0.05, "role_shrinks": 0.05,
               "hedged_language": 0.1, "absence_driven": 0.1, "incumbent_gone_for_good": 0.1,
               "team_states_new_role": 0.1, "report_is_firm": 0.9},
        choices={
            "availability_status": _choice(AVAIL, "out", 0.97),
            "horizon": _choice(("next_game_only", "multiple_games", "rest_of_season", "not_stated"), "next_game_only", 0.9),
            "opportunity_durability": _choice(("durable", "injury_fill_in", "unclear"), "unclear", 0.9),
            "stated_timeline": _choice(("day_to_day_or_game_time", "one_week", "two_to_three_weeks", "four_plus_weeks", "season_ending", "not_stated"), "not_stated", 0.9),
        },
        scores={"availability_impact": _score(4, 3), "role_impact": _score(3, 0)},
        model="jev-1.13.0", input_tokens=900,
    )
    nouls = {**base["nouls"], **over.pop("nouls", {})}
    choices = {**base["choices"], **over.pop("choices", {})}
    scores = {**base["scores"], **over.pop("scores", {})}
    return JevAnswers(nouls=nouls, choices=choices, scores=scores, model="jev-1.13.0", input_tokens=900)


def test_clear_out_is_auto_labeled_and_urgent():
    s = interpret(answers())
    assert s.usable and s.availability["label"] == "out" and s.availability["tier"] == "auto"
    assert s.urgency > 0.5 and s.avail_top_p > 0.8


@pytest.mark.parametrize("nouls,reason", [({"injection_suspect": 0.9}, "injection_suspect"), ({"about_player": 0.4}, "not_about_player")])
def test_gates_drop_the_item(nouls, reason):
    s = interpret(answers(nouls=nouls))
    assert not s.usable and s.drop_reason == reason and s.availability is None
    assert route_alert(s, is_my_starter=True) == "quiet"  # an unusable signal can never alert


def test_extremes_need_higher_confidence_than_other_labels():
    # confidence 0.86 clears the 0.80 bar for 'questionable' but not the 0.90 bar for 'out'
    p = (0.86 * (1 - 1 / 6)) + 1 / 6
    assert interpret(answers(choices={"availability_status": _choice(AVAIL, "questionable", p)})).availability["tier"] == "auto"
    assert interpret(answers(choices={"availability_status": _choice(AVAIL, "out", p)})).availability["tier"] == "tentative"


def test_low_confidence_degrades_to_raw_not_silence():
    s = interpret(answers(choices={"availability_status": _choice(AVAIL, "out", 0.3)}))
    assert s.usable and s.availability["tier"] == "raw"


def test_no_status_has_no_tier_and_runner_up_flags_at_risk():
    assert interpret(answers(choices={"availability_status": _choice(AVAIL, "no_status", 0.95)})).availability["tier"] == "none"
    split = ChoiceResult("questionable", 0.4, {"questionable": 0.5, "doubtful": 0.35, "out": 0.05, "limited_expected": 0.04, "full": 0.03, "no_status": 0.03})
    s = interpret(answers(choices={"availability_status": split}))
    assert s.availability["at_risk"] is True


@pytest.mark.parametrize(
    "e,sh,hedged,verdict",
    [(0.9, 0.05, 0.1, "expands"), (0.05, 0.9, 0.1, "shrinks"), (0.9, 0.05, 0.8, "possible"),
     (0.9, 0.9, 0.1, "possible"), (0.1, 0.1, 0.1, "none"), (0.5, 0.1, 0.1, "possible")],
)
def test_role_verdicts(e, sh, hedged, verdict):
    s = interpret(answers(nouls={"role_expands": e, "role_shrinks": sh, "hedged_language": hedged}))
    assert s.role["verdict"] == verdict


def test_durability_needs_headline_and_support_and_a_long_timeline():
    D = ("durable", "injury_fill_in", "unclear")
    T = ("day_to_day_or_game_time", "one_week", "two_to_three_weeks", "four_plus_weeks", "season_ending", "not_stated")
    good = interpret(answers(nouls={"incumbent_gone_for_good": 0.95}, choices={
        "opportunity_durability": _choice(D, "durable", 0.97), "stated_timeline": _choice(T, "season_ending", 0.95)}))
    assert good.durability["verdict"] == "durable"
    # headline says durable, but the stated timeline is short: disagreement is surfaced, not trusted
    clash = interpret(answers(nouls={"incumbent_gone_for_good": 0.95}, choices={
        "opportunity_durability": _choice(D, "durable", 0.97), "stated_timeline": _choice(T, "one_week", 0.95)}))
    assert clash.durability["verdict"] == "mixed"
    # durable headline without supporting evidence
    weak = interpret(answers(choices={"opportunity_durability": _choice(D, "durable", 0.97), "stated_timeline": _choice(T, "season_ending", 0.95)}))
    assert weak.durability["verdict"] == "mixed"
    fill = interpret(answers(choices={"opportunity_durability": _choice(D, "injury_fill_in", 0.95), "stated_timeline": _choice(T, "one_week", 0.9)}))
    assert fill.durability["verdict"] == "injury_fill_in"


def test_urgency_is_normalized_and_bounded():
    top = interpret(answers(scores={"availability_impact": _score(4, 3, 0.999), "role_impact": _score(3, 2, 0.999)}, nouls={"report_is_firm": 1.0}))
    assert 0.95 <= top.urgency <= 1.0
    bottom = interpret(answers(scores={"availability_impact": _score(4, 0, 0.999), "role_impact": _score(3, 0, 0.999)}, nouls={"report_is_firm": 0.0}))
    assert bottom.urgency < 0.05


def test_placeholder_policy_never_pushes_and_bad_returns_fail_loudly(monkeypatch):
    s = interpret(answers())
    assert route_alert(s, is_my_starter=True) == "in_app"  # until Derayc writes the policy
    monkeypatch.setattr(signals, "decide_alert_tier", lambda sig, *, is_my_starter: "buzz")
    with pytest.raises(ValueError):
        route_alert(s, is_my_starter=True)
