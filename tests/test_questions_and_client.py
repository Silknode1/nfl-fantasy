import json

import httpx2
import pytest
from typesafe_sdk import TypeSafeClient

from jev_signals import settings
from jev_signals.client import JevAnswers, JevClient, JevDisabled
from jev_signals.questions import QUESTION_IDS, news_questions

STATE = {
    "player": {"name": "Jordan Vale", "team": "KC", "position": "WR", "baseline_role": "rotational wide receiver"},
    "item": {"source_type": "HeadlineNews", "text": "Chiefs WR Jordan Vale has been ruled out Sunday, the team announced."},
}


def test_question_set_shape():
    qs = news_questions()
    assert len(qs) == 15 and set(qs) == set(QUESTION_IDS)
    for qid, q in qs.items():
        if q.type == "choice":
            assert 2 <= len(q.criteria) <= 255, qid
        if q.type == "score":
            assert 2 <= len(q.criteria) <= 10, qid  # docs: Score allows 2-10 levels
    # untrusted text must never be interpolated into instructions
    assert "item.text" in json.dumps(qs["about_player"].instructions)  # referenced by backticked path only
    assert all("Jordan" not in json.dumps(q.instructions) for q in qs.values())


def test_score_levels_are_descriptive_not_numeric():
    for qid in ("availability_impact", "role_impact"):
        for level in news_questions()[qid].criteria:
            assert len(level.split()) >= 3, f"{qid}: numeric-only levels fail (the model never sees level numbers)"


def test_mode_resolution(monkeypatch):
    assert settings.mode() == "off"
    monkeypatch.setenv("TYPESAFE_API_KEY", "k")
    assert settings.mode() == "live"
    monkeypatch.setenv("JEV_MODE", "mock")
    assert settings.mode() == "mock"
    monkeypatch.setenv("JEV_MODE", "garbage")
    assert settings.mode() == "live"  # unknown values are ignored, not trusted
    assert settings.model() == "jev-1.13.0"  # pinned, never the moving alias


def test_off_mode_raises():
    with pytest.raises(JevDisabled):
        JevClient()


def test_mock_answers_every_question_with_right_shapes():
    a = JevClient(mode="mock").ask(STATE, news_questions())
    assert a.model == "mock-heuristic"
    assert set(a.nouls) | set(a.choices) | set(a.scores) == set(QUESTION_IDS)
    assert a.choices["availability_status"].choice == "out"
    assert a.nouls["about_player"] > 0.9
    for sc in a.scores.values():
        assert abs(sum(sc.probabilities.values()) - 1) < 1e-6
    for ch in a.choices.values():
        assert abs(sum(ch.probabilities.values()) - 1) < 1e-6 and 0 <= ch.confidence <= 1


def test_answers_round_trip_through_json():
    a = JevClient(mode="mock").ask(STATE, news_questions())
    b = JevAnswers.from_dict(json.loads(json.dumps(a.to_dict())))  # what jsonb storage does
    assert b == a  # includes int-keyed Score probabilities surviving the string-key trip


def test_live_path_sends_the_documented_wire_format():
    """Drive the REAL SDK against a fake HTTP server and inspect what it would send."""
    seen = {}

    def handler(req):
        seen.update(url=str(req.url), method=req.method, body=json.loads(req.content))
        answers = {}
        for qid, q in seen["body"]["questions"].items():
            if q["type"] == "noul":
                answers[qid] = {"type": "noul", "noul": 0.9}
            elif q["type"] == "choice":
                opts = list(q["criteria"])
                answers[qid] = {
                    "type": "choice", "choice": opts[0], "confidence": 0.9,
                    "probabilities": {o: (0.95 if i == 0 else 0.05 / (len(opts) - 1)) for i, o in enumerate(opts)},
                }
            else:
                n = len(q["criteria"])
                answers[qid] = {
                    "type": "score", "score": 1.0, "confidence": 0.6,
                    "legend": {str(i): "x" for i in range(n)}, "probabilities": {str(i): 1 / n for i in range(n)},
                }
        return httpx2.Response(
            200, headers={"x-typesafe-request-id": "req_123"},
            json={"model": "jev-1.13.0", "usage": {"input_tokens": 321, "output_tokens": 0}, "answers": answers},
        )

    sdk = TypeSafeClient(api_key="test-key", model=settings.model(), transport=httpx2.MockTransport(handler))
    a = JevClient(mode="live", sdk_client=sdk).ask(STATE, news_questions())

    assert seen["url"] == "https://api.typesafe.ai/v1/systemone" and seen["method"] == "POST"
    assert seen["body"]["model"] == "jev-1.13.0"
    assert seen["body"]["state"] == STATE
    assert set(seen["body"]["questions"]) == set(QUESTION_IDS)
    assert a.request_id == "req_123" and a.input_tokens == 321 and a.model == "jev-1.13.0"
    assert a.choices["availability_status"].confidence == 0.9
