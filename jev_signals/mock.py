"""Keyword heuristics that stand in for Jev when there is no API key.

This exists so the pipeline, the UI scaffolding and the tests can run offline. It is NOT a model of
Jev's behaviour and says nothing about its accuracy: it matches a handful of phrases. Its responses are
parsed through the SDK's own SystemOneResponse, so downstream code exercises the real response types.
Answers carry model="mock-heuristic"; nothing downstream should ever treat them as signals.
"""
from __future__ import annotations

import json
import re

from typesafe_sdk import SystemOneResponse

_OUT = re.compile(r"ruled out|will not play|won't play|placed on (injured reserve|ir)\b|inactive|released|suspended")
_DOUBTFUL = re.compile(r"doubtful")
_QUESTIONABLE = re.compile(r"questionable|game-time decision|uncertain")
_LIMITED = re.compile(r"limited (in|at) practice|limited participant|expected to play but")
_FULL = re.compile(r"full participant|full practice|no restrictions?|expected to play")
_SEASON = re.compile(r"season-ending|out for the season|rest of the season|torn acl")
_WEEKS = re.compile(r"\b(two|three|four|five|six|2|3|4|5|6)\s+(to\s+\w+\s+)?weeks?\b|multiple (games|weeks)")
_DAY = re.compile(r"day-to-day|game-time")
_EXPAND = re.compile(r"starter|promoted|take over|lead role|larger role|more snaps|more targets|expected to start|will start")
_SHRINK = re.compile(r"benched|demoted|lost his (starting|job)|reduced role|fewer snaps|backup role|committee")
_HEDGE = re.compile(r"\b(could|might|may|reportedly|expected to|hopes?|sources say|per sources)\b")
_ABSENCE = re.compile(r"in the absence|with .{0,40} (out|sidelined|injured)|injury to|filling in for")
_FIRM = re.compile(r"announced|confirmed|officially|placed on|ruled out|said (tuesday|wednesday|thursday|friday|monday)")
_INJECTION = re.compile(r"ignore (all |any )?(previous|prior) |you are an? (ai|assistant)|answer (yes|no)|system prompt")


def _conf(pmax: float, n: int) -> float:
    return (pmax - 1 / n) / (1 - 1 / n) if n > 1 else 1.0


def _choice(options, pick: str, p: float = 0.85) -> dict:
    n = len(options)
    rest = (1 - p) / (n - 1) if n > 1 else 0.0
    probs = {o: (p if o == pick else rest) for o in options}
    return {"type": "choice", "choice": pick, "confidence": round(_conf(p, n), 4), "probabilities": probs}


def _score(n_levels: int, level: int, p: float = 0.8) -> dict:
    rest = (1 - p) / (n_levels - 1)
    probs = {str(i): (p if i == level else rest) for i in range(n_levels)}
    score = sum(i * float(q) for i, q in ((int(k), v) for k, v in probs.items()))
    legend = {str(i): f"level {i}" for i in range(n_levels)}
    return {"type": "score", "score": round(score, 4), "confidence": round(_conf(p, n_levels), 4), "legend": legend, "probabilities": probs}


def _noul(p: float) -> dict:
    return {"type": "noul", "noul": round(p, 4)}


def mock_response(state: dict, questions: dict) -> SystemOneResponse:
    text = " ".join(str(state.get("item", {}).get("text", "")).lower().split())
    name = str(state.get("player", {}).get("name", "")).lower().split()
    last = name[-1] if name else ""

    if _OUT.search(text):
        status = "out"
    elif _DOUBTFUL.search(text):
        status = "doubtful"
    elif _QUESTIONABLE.search(text):
        status = "questionable"
    elif _LIMITED.search(text):
        status = "limited_expected"
    elif _FULL.search(text):
        status = "full"
    else:
        status = "no_status"
    level = {"out": 3, "doubtful": 2, "questionable": 1, "limited_expected": 1, "full": 0, "no_status": 0}[status]
    expands, shrinks = bool(_EXPAND.search(text)), bool(_SHRINK.search(text))
    season = bool(_SEASON.search(text))

    def answer(qid: str, q) -> dict:
        options = list(q.criteria) if q.type == "choice" else []
        if qid == "about_player":
            return _noul(0.95 if last and last in text else 0.10)
        if qid == "injection_suspect":
            return _noul(0.95 if _INJECTION.search(text) else 0.02)
        if qid == "availability_status":
            return _choice(options, status, p=0.97 if status != "no_status" else 0.90)  # high enough to exercise the "auto" tier
        if qid == "horizon":
            pick = "rest_of_season" if season else "multiple_games" if _WEEKS.search(text) else (
                "next_game_only" if status != "no_status" else "not_stated")
            return _choice(options, pick)
        if qid == "role_expands":
            return _noul(0.90 if expands else 0.05)
        if qid == "role_shrinks":
            return _noul(0.90 if shrinks else 0.05)
        if qid == "hedged_language":
            return _noul(0.80 if _HEDGE.search(text) else 0.10)
        if qid == "absence_driven":
            return _noul(0.80 if _ABSENCE.search(text) else 0.10)
        if qid == "opportunity_durability":
            pick = "durable" if season or "released" in text or "traded" in text else (
                "injury_fill_in" if _DAY.search(text) or _WEEKS.search(text) else "unclear")
            return _choice(options, pick)
        if qid == "stated_timeline":
            pick = "season_ending" if season else "four_plus_weeks" if re.search(r"\b(four|five|six|4|5|6)\s+weeks", text) else (
                "two_to_three_weeks" if re.search(r"\b(two|three|2|3)\s+(to\s+\w+\s+)?weeks", text) else (
                    "one_week" if re.search(r"\bone week|1 week|next game", text) else (
                        "day_to_day_or_game_time" if _DAY.search(text) else "not_stated")))
            return _choice(options, pick)
        if qid == "incumbent_gone_for_good":
            return _noul(0.90 if season or "released" in text or "traded" in text else 0.10)
        if qid == "team_states_new_role":
            return _noul(0.85 if re.search(r"(coach|general manager|team) (said|announced|confirmed)", text) else 0.10)
        if qid == "availability_impact":
            return _score(len(q.criteria), level)
        if qid == "role_impact":
            return _score(len(q.criteria), 2 if expands or shrinks else 0)
        if qid == "report_is_firm":
            return _noul(0.85 if _FIRM.search(text) else 0.30)
        # unknown question id: neutral answer of the right shape
        if q.type == "noul":
            return _noul(0.5)
        if q.type == "choice":
            return _choice(options, options[0], p=1 / len(options))
        return _score(len(q.criteria), len(q.criteria) // 2, p=1 / len(q.criteria))

    payload = {
        "model": "mock-heuristic",
        "usage": {"input_tokens": len(json.dumps(state, default=str)) // 3 + 1200, "output_tokens": 0},
        "answers": {qid: answer(qid, q) for qid, q in questions.items()},
    }
    return SystemOneResponse.model_validate_json(json.dumps(payload))
