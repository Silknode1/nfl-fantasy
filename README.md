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

## Setup
1. Create a Supabase project, then run `schema.sql` in its SQL editor.
2. Fill in `.env` (see comments in the file).
3. `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
4. `python run_nightly.py`

## Schedule
- Nightly: `python run_nightly.py`
- Sunday ~10am CT: `python run_nightly.py --inactives` (inactives are the one truly time-critical datapoint)

## Agent tools (`tools.py`)
`query_sql`, `get_player_trend`, `get_matchup`, `get_waiver_targets`. The SQL tool should use the
read-only role (`AGENT_DB_URL`), never the service key.

## Notes
- nflverse stores all columns in `data` (jsonb); key columns are typed. Half-PPR lives in `v_weekly_half_ppr`.
- Snap counts are keyed by PFR id; join through `players.data->>'pfr_id'`.
- ESPN cookies expire. A 401 from the league pull means re-grab `espn_s2` and `SWID`.
- Never commit `.env`.
