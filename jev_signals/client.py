"""Thin wrapper over typesafe-sdk.

Why a wrapper: (1) answers are normalized into plain dataclasses that round-trip through jsonb, so
thresholds can be re-tuned later from stored probabilities with zero API calls; (2) one place pins the
model and the retry policy; (3) a mock backend lets the pipeline run end to end with no API key.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from . import settings


class JevDisabled(RuntimeError):
    """Raised when Jev is off (no API key and JEV_MODE not set)."""


@dataclass(frozen=True)
class ChoiceResult:
    choice: str
    confidence: float
    probabilities: dict[str, float]

    def runner_up(self) -> tuple[str | None, float]:
        ranked = sorted(self.probabilities.items(), key=lambda kv: kv[1], reverse=True)
        return ranked[1] if len(ranked) > 1 else (None, 0.0)


@dataclass(frozen=True)
class ScoreResult:
    score: float
    confidence: float
    probabilities: dict[int, float]

    @property
    def levels(self) -> int:
        return len(self.probabilities)


@dataclass(frozen=True)
class JevAnswers:
    nouls: dict[str, float] = field(default_factory=dict)
    choices: dict[str, ChoiceResult] = field(default_factory=dict)
    scores: dict[str, ScoreResult] = field(default_factory=dict)
    model: str = ""
    request_id: str | None = None
    input_tokens: int = 0

    @classmethod
    def from_response(cls, resp) -> "JevAnswers":
        try:
            request_id = resp.request_id  # raises TypeSafeError when the header is absent (mock transports)
        except Exception:
            request_id = None
        return cls(
            nouls={k: float(v.noul) for k, v in resp.nouls.items()},
            choices={
                k: ChoiceResult(v.choice, float(v.confidence), {str(o): float(p) for o, p in v.probabilities.items()})
                for k, v in resp.choices.items()
            },
            scores={
                k: ScoreResult(float(v.score), float(v.confidence), {int(o): float(p) for o, p in v.probabilities.items()})
                for k, v in resp.scores.items()
            },
            model=str(resp.model),
            request_id=request_id,
            input_tokens=int(resp.usage.input_tokens),
        )

    def to_dict(self) -> dict:
        return {
            "model": self.model,
            "request_id": self.request_id,
            "input_tokens": self.input_tokens,
            "nouls": self.nouls,
            "choices": {
                k: {"choice": v.choice, "confidence": v.confidence, "probabilities": v.probabilities}
                for k, v in self.choices.items()
            },
            "scores": {
                k: {"score": v.score, "confidence": v.confidence, "probabilities": {str(i): p for i, p in v.probabilities.items()}}
                for k, v in self.scores.items()
            },
        }

    @classmethod
    def from_dict(cls, d: dict) -> "JevAnswers":
        return cls(
            nouls={k: float(v) for k, v in d.get("nouls", {}).items()},
            choices={
                k: ChoiceResult(v["choice"], float(v["confidence"]), {o: float(p) for o, p in v["probabilities"].items()})
                for k, v in d.get("choices", {}).items()
            },
            scores={
                k: ScoreResult(float(v["score"]), float(v["confidence"]), {int(o): float(p) for o, p in v["probabilities"].items()})
                for k, v in d.get("scores", {}).items()
            },
            model=d.get("model", ""),
            request_id=d.get("request_id"),
            input_tokens=int(d.get("input_tokens", 0)),
        )


class JevClient:
    """ask(state, questions) -> JevAnswers.

    mode: "live" calls api.typesafe.ai through typesafe-sdk; "mock" uses keyword heuristics (offline).
    sdk_client: inject a preconfigured TypeSafeClient (the tests pass one with a fake HTTP transport).
    """

    def __init__(self, mode: str | None = None, sdk_client=None):
        self.mode = mode or settings.mode()
        if self.mode == "off":
            raise JevDisabled("Jev is off: set TYPESAFE_API_KEY, or JEV_MODE=mock for an offline dry run")
        self._sdk = sdk_client

    def _live(self):
        if self._sdk is None:
            from typesafe_sdk import RetryPolicy, TypeSafeClient

            # api_key comes from TYPESAFE_API_KEY. The SDK raises TypeSafeError here if it is missing or invalid.
            self._sdk = TypeSafeClient(model=settings.model(), retry=RetryPolicy(max_retries=3))
        return self._sdk

    def ask(self, state: dict, questions: dict) -> JevAnswers:
        if self.mode == "mock":
            from .mock import mock_response

            return JevAnswers.from_response(mock_response(state, questions))
        return JevAnswers.from_response(self._live().system_one(state, questions))

    def close(self) -> None:
        if self._sdk is not None:
            self._sdk.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
