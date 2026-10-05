"""Answers -> Signal -> alert tier. Code owns every threshold; Jev only supplies probabilities.

Doc rules this follows: use Choice `confidence` to decide whether to act; use Noul probability directly;
normalize a Score by (levels - 1) before weighting; never reuse a threshold across question types;
when unsure, degrade to showing the raw text rather than hiding it.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from .client import JevAnswers
from .settings import DEFAULT_THRESHOLDS, Thresholds

ALERT_TIERS = ("push", "in_app", "quiet")
_SHORT_TIMELINES = {"day_to_day_or_game_time", "one_week", "two_to_three_weeks"}
_LONG_TIMELINES = {"four_plus_weeks", "season_ending"}


@dataclass
class Signal:
    usable: bool
    drop_reason: str | None = None
    availability: dict | None = None  # label, confidence, tier(auto|tentative|raw|none), at_risk, horizon
    role: dict | None = None  # verdict(expands|shrinks|possible|none), expands_p, shrinks_p, hedged_p, absence_driven_p
    durability: dict | None = None  # verdict(durable|injury_fill_in|mixed|unclear), headline, confidence, timeline, support
    firm_p: float = 0.0
    avail_score: float = 0.0  # 0..3 probability-weighted level of availability_impact
    avail_score_conf: float = 0.0
    avail_top_p: float = 0.0  # probability mass on the highest level ("he will not play")
    urgency: float = 0.0  # 0..1 composite of availability impact, role impact and firmness

    def to_dict(self) -> dict:
        return asdict(self)


def _r(x: float) -> float:
    return round(float(x), 3)


def interpret(a: JevAnswers, th: Thresholds = DEFAULT_THRESHOLDS) -> Signal:
    n, c, s = a.nouls, a.choices, a.scores

    # Gates first: an item that fails identity or looks like an injection attempt produces no signal.
    if n["injection_suspect"] >= th.injection_drop:
        return Signal(usable=False, drop_reason="injection_suspect")
    if n["about_player"] < th.about_player_min:
        return Signal(usable=False, drop_reason="not_about_player")

    # --- availability -------------------------------------------------------------------------
    ch = c["availability_status"]
    runner, runner_p = ch.runner_up()
    bar = th.avail_auto_extreme if ch.choice in {"out", "full"} else th.avail_auto
    if ch.choice == "no_status":
        tier = "none"
    elif ch.confidence >= bar:
        tier = "auto"
    elif ch.confidence >= th.avail_tentative:
        tier = "tentative"
    else:
        tier = "raw"
    hz = c["horizon"]
    availability = {
        "label": ch.choice,
        "confidence": _r(ch.confidence),
        "tier": tier,
        "at_risk": ch.choice != "no_status" and runner not in (None, "no_status") and runner_p > th.at_risk_second_p,
        "horizon": hz.choice if hz.confidence >= th.avail_tentative else "not_stated",
    }

    # --- role change --------------------------------------------------------------------------
    e, sh, hedged = n["role_expands"], n["role_shrinks"], n["hedged_language"]
    if e >= th.role_fire and sh >= th.role_fire:
        verdict = "possible"  # contradictory answers: do not pick a side
    elif max(e, sh) >= th.role_fire:
        verdict = "possible" if hedged >= th.hedge_max else ("expands" if e >= sh else "shrinks")
    elif max(e, sh) <= th.role_none:
        verdict = "none"
    else:
        verdict = "possible"
    role = {
        "verdict": verdict,
        "expands_p": _r(e),
        "shrinks_p": _r(sh),
        "hedged_p": _r(hedged),
        "absence_driven_p": _r(n["absence_driven"]),
    }

    # --- waiver durability: model reads phrases into buckets, code compares and decides ----------------
    dur = c["opportunity_durability"]
    _, dur_runner_p = dur.runner_up()
    timeline = c["stated_timeline"].choice
    support = max(n["incumbent_gone_for_good"], n["team_states_new_role"])
    if dur.choice == "unclear":
        d_verdict = "unclear"
    elif dur.confidence < th.mixed_below_conf or dur_runner_p > 0.25:
        d_verdict = "mixed"
    elif dur.choice == "durable":
        if dur.confidence >= th.durable_conf and support >= th.durable_support and timeline not in _SHORT_TIMELINES:
            d_verdict = "durable"
        else:
            d_verdict = "mixed"  # headline says durable but the supporting questions or timeline disagree
    else:  # injury_fill_in
        long_or_gone = timeline in _LONG_TIMELINES or n["incumbent_gone_for_good"] >= th.durable_support
        d_verdict = "injury_fill_in" if dur.confidence >= th.fill_in_conf and not long_or_gone else "mixed"
    durability = {
        "verdict": d_verdict,
        "headline": dur.choice,
        "confidence": _r(dur.confidence),
        "timeline": timeline,
        "support": _r(support),
    }

    # --- urgency: normalize Scores by (levels - 1), then weight --------------------------------------
    av, ro = s["availability_impact"], s["role_impact"]
    a_norm = av.score / (av.levels - 1) if av.levels > 1 else 0.0
    r_norm = ro.score / (ro.levels - 1) if ro.levels > 1 else 0.0
    firm = n["report_is_firm"]
    urgency = th.w_avail * a_norm + th.w_role * r_norm + th.w_firm * firm
    return Signal(
        usable=True,
        availability=availability,
        role=role,
        durability=durability,
        firm_p=_r(firm),
        avail_score=_r(av.score),
        avail_score_conf=_r(av.confidence),
        avail_top_p=_r(av.probabilities[max(av.probabilities)]) if av.probabilities else 0.0,
        urgency=_r(min(max(urgency, 0.0), 1.0)),
    )


# --------------------------------------------------------------------------------------------------
# YOUR CALL (Derayc): when does a news item buzz your phone?
#
# `signal` arrives already past the identity and injection gates (route_alert drops everything else to
# "quiet"), so you only decide among usable items. Fields you can use:
#   signal.urgency              0..1 composite = 0.55 * availability impact + 0.25 * role impact + 0.20 * firmness
#   signal.avail_score          0..3  (3 = "he will not play");  signal.avail_score_conf  0..1
#   signal.avail_top_p          probability mass on level 3, useful when the score is an average of a split
#   signal.availability         {"label", "confidence", "tier", "at_risk", "horizon"}
#   signal.role                 {"verdict": expands | shrinks | possible | none, ...}
#   signal.durability           {"verdict": durable | injury_fill_in | mixed | unclear, ...}
#   signal.firm_p               P(report is confirmed rather than rumor)
#   is_my_starter               True if he is in a starting slot on your ESPN team right now
#
# Return "push" (phone buzzes), "in_app" (shows up in the feed, no buzz), or "quiet" (stored only).
#
# Trade-offs to weigh:
#   * A missed "out" an hour before Sunday kickoff costs a zero in your lineup; a false push costs trust,
#     and after a few of them you stop reading the alerts at all.
#   * Low-confidence answers fail loudly in the docs' pattern: show the raw text in-app, do not suppress.
#   * Bench players matter for waivers, not for lineup alerts. Consider whether a durability verdict of
#     "durable" on a player you do not own should ever push.
#
# PLACEHOLDER BELOW: safe and deliberately dumb. Nothing pushes until you write the policy.
def decide_alert_tier(signal: Signal, *, is_my_starter: bool) -> str:
    return "in_app"


def route_alert(signal: Signal, *, is_my_starter: bool) -> str:
    """Safety rail around your policy: unusable signals never alert, and a bad return value fails loudly."""
    if not signal.usable:
        return "quiet"
    tier = decide_alert_tier(signal, is_my_starter=is_my_starter)
    if tier not in ALERT_TIERS:
        raise ValueError(f"decide_alert_tier returned {tier!r}; expected one of {ALERT_TIERS}")
    return tier
