# nfl-fantasy

Free-data NFL + fantasy pipeline for an LLM agent. 12-team, 0.5 PPR, ESPN league 1065732.

## Data sources
| Source | What | Cost |
|---|---|---|
| nflverse (`nflreadpy`) | play-by-play-derived weekly stats, injuries, snaps, schedules, player ID map | free |
| Sleeper API | trending adds/drops (waiver demand) | free, no auth |
| ESPN scoreboard JSON | live scores (unofficial endpoint) | free |
| ESPN via `espn-api` | your private league rosters (your own cookies) | free |
| The Odds API | totals/spreads | free tier ~500 req/mo |
| ESPN news JSON | headlines with tagged players and teams (unofficial endpoint) | free |
| TypeSafe Jev | typed judgments over news text (availability, role change, durability, urgency) | $0.042 / M input tokens |

## Setup
1. Create a Supabase project, then run `schema.sql` in its SQL editor.
2. Fill in `.env` (see comments in the file).
3. `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
4. Optional, for Jev: run `schema_jev.sql`, add `TYPESAFE_API_KEY` to `.env` (see `docs/JEV.md`)
5. `python run_nightly.py`

## Schedule
- Nightly: `python run_nightly.py`
- Sunday ~10am CT: `python run_nightly.py --inactives` (inactives are the one truly time-critical datapoint)

## Agent tools (`tools.py`)
`query_sql`, `get_player_trend`, `get_matchup`, `get_waiver_targets`, `get_player_signals` (Jev-judged news). The SQL tool should use the
read-only role (`AGENT_DB_URL`), never the service key.

## Jev signal layer
News ingest plus Jev judgments live in `news_ingest.py`, `judge_news.py` and `jev_signals/`; design, thresholds
and tuning are in `docs/JEV.md`. A local mirror of the vendor docs is in `docs/typesafe/` (gitignored). Tests run offline:
`pip install -r requirements-dev.txt && pytest`.

## Notes
- nflverse stores all columns in `data` (jsonb); key columns are typed. Half-PPR lives in `v_weekly_half_ppr`.
- Snap counts are keyed by PFR id; join through `players.data->>'pfr_id'`.
- ESPN cookies expire. A 401 from the league pull means re-grab `espn_s2` and `SWID`.
- Never commit `.env`.

## Fantasy screens (`fantasy/` + `web/`)
Your team, trade finder with A+ to F grades, waivers, league position ranks, our ranks vs ESPN, and a season plan.

- `python -m fantasy.build` pulls the private ESPN league (your `ESPN_S2`/`ESPN_SWID`), the Supabase tables, and Jev judgments,
  then writes `web/public/data/fantasy.json`, refreshes `espn_league_rosters`, and saves a row to `fantasy_snapshots` (`schema_fantasy.sql`).
  `--offline` re-runs projections on the cached pulls in `data_cache/`.
- `./fantasy.sh` does both in one go: refreshes the data, then starts the app at http://localhost:5173 (`./fantasy.sh --offline` skips the pulls).
- `cd web && npm install && npm run dev` serves the app. `npm run build:artifact` (after `python scripts/inline_photos.py public/data/fantasy.json src/inline-data.json`) makes the single-file preview.
- Split: Python owns projections (`fantasy/engine.py`); the browser owns decisions (`web/src/engine`: lineups, ranks, 3,000-season simulation, trades, grades, waivers, plan).
- Gotchas: the Supabase Data API here defaults to the `api` schema, so REST calls send `Accept-Profile: public`. League data is gitignored (it has every manager's roster).
