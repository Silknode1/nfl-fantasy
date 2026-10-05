# Jev signal layer

Jev (TypeSafe's System One) is a hosted classifier-style model. You hand it a small JSON `state` plus typed
questions and it returns calibrated answers: a probability (Noul), a category with confidence (Choice), or a
probability-weighted level (Score). It cannot write text, explain itself, or do arithmetic, and it is weak at
counting and date comparison. That shapes everything below: **code owns control flow, identity, numbers,
dates and thresholds; Jev only turns messy text into typed judgments.**

A local mirror of the vendor docs is in `docs/typesafe/` (62 pages, indexed in its README; gitignored so
vendor text is not pushed to GitHub) so the design can be checked against the source. Start with `concepts/how-to-build-with-system-one.md`, `confidence.md`,
`primitives/*.md` and `model-jaggedness/jev-1.13.md`.

## What goes through Jev, and what does not

| Question | Where it runs | Why |
|---|---|---|
| Snap share, target share, EPA, usage trends, floors | SQL / polars | Numbers. Jev is not a calculator. |
| Odds conversion, line movement size and direction | code | Arithmetic and timestamps. |
| Official injury designation (structured) | parsed in code (`espn_league_rosters.injury_status`, `injuries`) | Already typed. Jev adds nothing. |
| Which player a news item is about | ESPN athlete tags + `players.espn_id` in code | Identity must be deterministic. |
| **Availability from free text** (beat writers, coach quotes) | Jev Choice | Messy language, closed answer set. |
| **Role change** (more or fewer touches) and hedging | Jev Noul fan-out | Needs reading comprehension. |
| **Waiver durability** (lasting opening vs short injury fill-in) | Jev reads phrases into buckets; code compares | The model reads, code decides (no date math in the model). |
| **Alert urgency** | Jev Scores + Noul, combined in code | Weights and thresholds are yours. |
| Injection / off-topic gates | Jev Noul used only as a filter | Untrusted text can steer a model; gates never trigger side effects alone. |
| *Planned:* does a news item explain a line move | Jev Noul per candidate item | Correlation label only, never a betting signal. |

## Data flow

```
ESPN news feed --news_ingest.py--> news_items
                                      |  eligible(): fresh, 1-3 tagged athletes, enough text
                                      v
        players (espn_id -> player, in code) + snap_counts (role phrase, in code)
                                      |  build_state(): names, team, role in WORDS, item text. No raw numbers.
                                      v
              Jev: 15 questions, one request, answered independently
                                      |  stored raw in jev_judgments.answers
                                      v
        interpret(): thresholds in code  ->  Signal  ->  route_alert(decide_alert_tier)  ->  jev_judgments
                                                                                    \-> tools.get_player_signals()
```

## Setup

1. **Install the Jev skill for Claude Code** (official path; run in your terminal, not inside a session):
   `claude plugin marketplace add typesafe-ai/skills` then `claude plugin install typesafe@typesafe-ai`.
   It teaches Claude Code how to write System One questions. The app itself does not depend on it.
2. `pip install -r requirements.txt` (adds `typesafe-sdk`).
3. Put your key in `.env` as `TYPESAFE_API_KEY=...` (never commit `.env`), then `./scripts/push_secrets.sh` to
   copy it, and `ESPN_MY_TEAM_ID`, into GitHub Actions secrets.
4. Run `schema_jev.sql` in the Supabase SQL editor (creates `news_items` and `jev_judgments`, RLS on, read-only
   agent policy to match the other tables).
5. **Check Jev works** (one command, prints no secrets): `python -m jev_signals.smoke`. It lists models, makes one real
   call with the production 15-question set, and runs two behavioral probes. Add `--eval` to also score the 15 synthetic
   seed items (about 15 more calls, roughly a cent). All PASS means the wiring and question shapes are accepted by the
   real API; WARN lines are single-example sanity probes, not accuracy.
6. Try the pipeline: `python news_ingest.py && python judge_news.py --dry-run`. The nightly run does both automatically.

Modes (`JEV_MODE`): `live` (default when the key is set), `mock` (offline keyword heuristics; always a dry run
unless `JEV_MOCK_WRITE=1`), `off` (default with no key; the step skips politely). Model is pinned to
`jev-1.13.0` (`JEV_MODEL` to override). Never use `jev-latest`: the alias moves when a new model ships.

## Question set (`jev_signals/questions.py`, 15 questions, `news_v1`)

Gates: `about_player`, `injection_suspect`. Availability: `availability_status` (6 options), `horizon`.
Role: `role_expands`, `role_shrinks`, `hedged_language`, `absence_driven`. Durability: `opportunity_durability`,
`stated_timeline`, `incumbent_gone_for_good`, `team_states_new_role`. Urgency parts: `availability_impact`
(Score, 4 levels), `role_impact` (Score, 3 levels), `report_is_firm`.

Rules baked in: one property per question; question ids are not sent to the model so every instruction is a
complete question; untrusted text appears only in `state`; role is sent as a phrase ("lead running back"),
never as a snap percentage; Score levels are descriptive sentences (numeric-only levels fail).

## Thresholds (`jev_signals/settings.py`, ALL PROPOSALS)

| Decision | Rule |
|---|---|
| Identity | drop if `about_player` < 0.80 or `injection_suspect` >= 0.70 |
| Availability label | Choice confidence >= 0.80 auto; >= 0.90 for `out`/`full`; 0.50-0.80 tentative; below that show raw text. Runner-up > 0.25 flags "at risk" |
| Role change | `expands`/`shrinks` at >= 0.80 and hedging < 0.50; <= 0.20 none; else "possible"; both high = "possible" |
| Durability | `durable` needs headline confidence >= 0.85, supporting Noul >= 0.70, and a long or unstated timeline; disagreements become `mixed` |
| Urgency | 0.55 * availability impact + 0.25 * role impact + 0.20 * firmness (Scores normalized by levels - 1) |

These come from cookbook examples measured on **jev-1.12 with non-sports data**. They are starting points.
Tune with `python -m jev_signals.evals.run_eval --labels <your labels>.jsonl`; stored raw answers let you
re-threshold with `--from-run` at zero API cost. `seed_labels.jsonl` is synthetic and only proves the harness works.

## Your decision: `decide_alert_tier`

`jev_signals/signals.py::decide_alert_tier` is a placeholder that returns `in_app` for everything, so nothing
pushes until you write the policy. Safety rail: `route_alert` forces unusable signals to `quiet` and rejects any
return value other than `push`, `in_app` or `quiet`.

## Known limits and open items

- **Not live-tested until you run the smoke test.** No API key was available while building this. The wire format was
  verified by driving the real SDK against a fake HTTP server (request body, model pin, response parsing), not against
  the real API. The first real call is what proves the API accepts the question shapes (nested `{what, not_for}` criteria,
  dict instructions).
- **ESPN feed quality is the bottleneck.** Articles tag players at article level; roundup stories tag 5-10
  athletes with a one-line generic description, so the gate skips anything with more than 3 tags. The shape
  was checked from a cached copy of the feed (Aug 2026); confirm freshness on the first real run
  (`news_ingest.py` warns when the newest item is over 48h old). A richer player-news source would help more
  than any Jev tuning.
- Cost is trivial ($0.042 per million input tokens; a judgment is roughly a thousand tokens), but rate limits
  are dynamic and published figures disagree (the live models page said 100K tokens/s and 80 requests/s on 2026-10-03;
  other copies say 40 req/s, and one skill says 250K tokens/s). Do not hard-code any of them: keep to about 8 concurrent
  workers per key and let the SDK retry 429/5xx (3 attempts).
- Not wired yet: hours to kickoff and teammates-out context in `state`, line-move explanation, a labeled
  sports set, the UI.
- Docs inconsistency to keep in mind: cookbooks pin `jev-1.12` while the default alias is `jev-1.13.0`.
