"""Jev configuration: model pin, run limits, and decision thresholds.

Every threshold here is a PROPOSAL. The values are adapted from TypeSafe's cookbooks, which were
measured on jev-1.12 with non-sports data. Re-tune on labeled sports items (jev_signals/evals) before
you let an alert reach your phone. Thresholds live in code, not in question wording, so re-tuning costs
no API calls as long as raw probabilities are stored (they are, in jev_judgments.answers).
"""
import os
from dataclasses import dataclass

PINNED_MODEL = "jev-1.13.0"  # never "jev-latest": the alias moves when TypeSafe ships a new model
QUESTION_SET = "news_v1"  # bump when questions.py changes; judgments are keyed by it
PRICE_PER_M_INPUT_TOKENS = 0.042  # USD per million input tokens (docs, Oct 2026); output is free

FANTASY_POSITIONS = ("QB", "RB", "WR", "TE")
MAX_AGE_HOURS = 72  # older items describe a past game's situation
MAX_ATHLETES_PER_ITEM = 3  # a story tagging 8 players is not "about" any single one of them
MAX_JUDGMENTS_PER_RUN = 200  # hard cap on Jev calls per nightly run
MIN_TEXT_CHARS = 30


def model() -> str:
    return os.getenv("JEV_MODEL", PINNED_MODEL)


def mode() -> str:
    """live | mock | off.

    JEV_MODE wins if it is one of those values. Otherwise live when TYPESAFE_API_KEY is set, else off.
    Mock is never selected implicitly: a mock judgment that reaches the database looks like a real one.
    """
    explicit = os.getenv("JEV_MODE", "").strip().lower()
    if explicit in {"live", "mock", "off"}:
        return explicit
    return "live" if os.getenv("TYPESAFE_API_KEY") else "off"


@dataclass(frozen=True)
class Thresholds:
    # identity / safety gates
    about_player_min: float = 0.80  # P(item is about this player) must clear this or the item is dropped
    injection_drop: float = 0.70  # P(item tries to instruct the reader) at or above this drops the item
    # availability (Choice confidence; extremes move lineups, so they need more)
    avail_auto: float = 0.80
    avail_auto_extreme: float = 0.90  # applies to "out" and "full"
    avail_tentative: float = 0.50
    at_risk_second_p: float = 0.25  # runner-up option above this => flag "at risk"
    # role change (Noul probabilities)
    role_fire: float = 0.80
    role_none: float = 0.20
    hedge_max: float = 0.50  # hedged wording at or above this downgrades a fire to "possible"
    # waiver durability
    durable_conf: float = 0.85  # a false "durable" wastes FAAB, so the bar is high
    durable_support: float = 0.70
    fill_in_conf: float = 0.70
    mixed_below_conf: float = 0.50
    # composite urgency weights (sum to 1)
    w_avail: float = 0.55
    w_role: float = 0.25
    w_firm: float = 0.20


DEFAULT_THRESHOLDS = Thresholds()
