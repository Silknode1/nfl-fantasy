import json

import httpx2
from typesafe_sdk import TypeSafeClient

from jev_signals import settings, smoke


def server(fail=None):
    """A fake TypeSafe API. fail=(status, error_type) makes every call return that error."""

    def answer(qid, q, text):
        if q["type"] == "noul":
            p = {"injection_suspect": 0.95 if "ignore all previous" in text else 0.02,
                 "about_player": 0.1 if "titans" in text else 0.95}.get(qid, 0.3)
            return {"type": "noul", "noul": p}
        if q["type"] == "choice":
            opts = list(q["criteria"])
            pick = "out" if qid == "availability_status" and "ruled out" in text else opts[-1]
            return {"type": "choice", "choice": pick, "confidence": 0.95,
                    "probabilities": {o: (0.97 if o == pick else 0.03 / (len(opts) - 1)) for o in opts}}
        n = len(q["criteria"])
        level = n - 1 if qid == "availability_impact" and "ruled out" in text else 0
        return {"type": "score", "score": float(level), "confidence": 0.9, "legend": {str(i): "x" for i in range(n)},
                "probabilities": {str(i): (0.97 if i == level else 0.03 / (n - 1)) for i in range(n)}}

    def handler(req):
        if fail:
            return httpx2.Response(fail[0], headers={"x-typesafe-request-id": "req_fail"},
                                   json={"detail": {"error_type": fail[1], "message": "nope"}})
        if req.url.path.endswith("/models"):
            return httpx2.Response(200, json={"models": [{"name": "jev-latest", "description": "stable", "release_date": "2026-09-15"}]})
        body = json.loads(req.content)
        text = json.dumps(body["state"]).lower()
        return httpx2.Response(200, headers={"x-typesafe-request-id": "req_ok"},
                               json={"model": body["model"], "usage": {"input_tokens": 900, "output_tokens": 0},
                                     "answers": {k: answer(k, q, text) for k, q in body["questions"].items()}})

    return TypeSafeClient(api_key="test-key", model=settings.model(), transport=httpx2.MockTransport(handler))


def test_smoke_passes_against_a_healthy_api():
    lines = []
    assert smoke.run_smoke(server(), out=lines.append) == 0
    text = "\n".join(lines)
    verdicts = [ln.split()[0] for ln in lines if ln.startswith(("  PASS", "  WARN", "  FAIL"))]
    assert verdicts and set(verdicts) == {"PASS"} and len(verdicts) >= 8, verdicts
    assert "all 15 question ids answered" in text and "request_id=req_ok" in text


def test_smoke_reports_a_rejected_key_without_leaking_it():
    lines = []
    assert smoke.run_smoke(server(fail=(401, "authentication_error")), out=lines.append) == 1
    text = "\n".join(lines)
    assert "FAIL" in text and "status=401" in text and "request_id=req_fail" in text
    assert "test-key" not in text and "Replace it in your .env" in text


def test_smoke_surfaces_a_rejected_question_shape():
    lines = []
    import httpx2 as h  # models list works, system_one is rejected

    def handler(req):
        if req.url.path.endswith("/models"):
            return h.Response(200, json={"models": []})
        return h.Response(422, headers={"x-typesafe-request-id": "req_422"}, json={"detail": "criteria.out must be a string"})

    sdk = TypeSafeClient(api_key="k", model=settings.model(), transport=h.MockTransport(handler))
    assert smoke.run_smoke(sdk, out=lines.append) == 1
    assert "status=422" in "\n".join(lines) and "criteria.out must be a string" in "\n".join(lines)


def test_main_refuses_politely_without_a_key(monkeypatch, capsys):
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **k: False)
    assert smoke.main([]) == 1
    assert "TYPESAFE_API_KEY is not visible" in capsys.readouterr().out
