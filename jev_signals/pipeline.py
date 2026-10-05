"""Judge one (news item, player) pair end to end. Pure apart from the Jev call, so it is easy to test."""
from __future__ import annotations

from datetime import datetime, timezone

from . import settings
from .client import JevClient
from .feed import item_text
from .questions import news_questions
from .signals import interpret, route_alert
from .state import build_state


def judge_pair(
    client: JevClient,
    item: dict,
    espn_id: str,
    player: dict,
    baseline_role: str,
    *,
    is_my_starter: bool = False,
    th=settings.DEFAULT_THRESHOLDS,
) -> dict:
    """Returns a row for the jev_judgments table."""
    state = build_state(player, item_text(item), item.get("source_type"), baseline_role)
    answers = client.ask(state, news_questions())
    signal = interpret(answers, th)
    return {
        "news_id": item["news_id"],
        "espn_id": str(espn_id),
        "player_id": player["player_id"],
        "question_set": settings.QUESTION_SET,
        "model": answers.model,
        "request_id": answers.request_id,
        "input_tokens": answers.input_tokens,
        "answers": answers.to_dict(),
        "signal": signal.to_dict(),
        "alert_tier": route_alert(signal, is_my_starter=is_my_starter),
        "judged_at": datetime.now(timezone.utc).isoformat(),
    }


def estimated_cost_usd(rows: list[dict]) -> float:
    return sum(r["input_tokens"] for r in rows) / 1_000_000 * settings.PRICE_PER_M_INPUT_TOKENS
