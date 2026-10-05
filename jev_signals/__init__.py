"""Jev (TypeSafe System One) signal layer for the NFL fantasy app.

Jev reads messy news text and returns typed judgments (probabilities, categories, scores).
Everything deterministic stays in code: identity resolution, thresholds, arithmetic, dates, alerts.
See docs/JEV.md for the design and docs/typesafe/ for the mirrored vendor docs.

Layout
  settings.py   model pin, run limits, PROPOSED thresholds
  questions.py  the question set sent with every news item
  client.py     thin wrapper over typesafe-sdk (live) with a mock mode; normalizes answers
  mock.py       keyword heuristics that stand in for Jev offline (never a measure of Jev's accuracy)
  state.py      team codes, player resolution, role buckets, state construction
  feed.py       ESPN news payload -> rows, plus the eligibility gate
  signals.py    answers -> Signal (code-owned thresholds) and alert routing
  pipeline.py   judge one (news item, player) pair end to end
  evals/        labeled-set harness for tuning thresholds
"""
