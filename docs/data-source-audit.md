# Data-source audit

Read-only audit for the NFL fantasy app in this repository. Date of inspection: 2026-10-19.

This file records two different kinds of evidence:

- **Verified.** Read in this checkout. File paths are the citation.
- **Not retrieved.** A public page, license, price, field list, or coverage window that this run did not fetch. Nothing in those rows is a finding about the vendor.

`/agent/repos/nfl-fantasyv2` was checked only to see whether it holds a second app. Its checkout is a README whose body is the title `nfl-fantasyv2`. It has no ingest code and is not a data source.

## Research status

The requested method was Parallel deep research (`parallel-cli research run`, processor `pro-fast`, text report).

| Check | Result |
|---|---|
| CLI | `parallel-cli` 0.9.3, package `parallel-web-tools` 0.9.3, installed in this environment because it was not on `PATH` |
| Auth | `parallel-cli auth --json` returned `authenticated: false`, `method: null`, `env_var_set: false`, `has_stored_credentials: false` |
| Research task | Not created. No `run_id`, no `interaction_id`, no monitoring URL, no `.md` or `.json` research artifact |

The deep-research skill forbids substituting another search tool or memory when that CLI cannot run the job. This audit therefore does **not** state licenses, prices, rate limits, historical coverage, or field dictionaries for FantasyData, SportsDataIO, Endzone, The Odds API's public terms, FootballDB, NFL Savant, TeamRankings, ESPN's public stats pages, Next Gen Stats, Pro Football Reference, Roll Coverage, nflverse, ffverse, dynastyprocess, or the listed GitHub projects.

A later session can resume only after `parallel-cli login` or `PARALLEL_API_KEY` is available in the environment that runs the CLI. Do not treat this document as clearance to ship any source in a public or commercial app.

## What this app already stores or computes

Nightly ingest is `run_nightly.py` calling the modules below. Typed columns are thin. Most vendor fields land in `data` jsonb so a column rename does not break the load (`schema.sql`). The fantasy build then selects a subset (`fantasy/db_pull.py`).

| Need | Already in the app? | Source in this repo | Stored or computed | Label |
|---|---|---|---|---|
| Offensive snaps and snap share | Yes, weekly | nflverse via `nflreadpy.load_snap_counts` in `nflverse_ingest.py` | Stored: `snap_counts.data` (`offense_snaps`, `offense_pct` selected). Keyed by PFR id, joined through `players.data->>'pfr_id'` | Verified |
| Season snap share and recent snap trend | Yes | Same snap rows | Computed in `fantasy/engine.py` `usage()`: mean of `offense_pct` over weeks that have a snap row; trend is mean of the last 2 weeks minus mean of earlier weeks, only when there are at least 3 values | Verified |
| Targets, target share, carries | Yes, weekly | nflverse via `load_player_stats` | Stored in `weekly_stats.data`. Selected as `targets`, `target_share`, `carries` | Verified |
| Target share and carry/target volume, season and recent | Yes | Those weekly fields | Computed in `usage()`: season mean of `target_share`; per-game means of targets and carries; same last-2-vs-earlier trend. WR/TE trend uses target-share change, capped at ±6% inside `trend_mult`. RB trend uses (targets + carries) per game | Verified |
| Catches | Yes, weekly | Same weekly stats | Stored as `receptions`. Used in `v_weekly_half_ppr` and in the opponent-points sum | Verified |
| Catch rate | Not computed | Receptions and targets are both selected | Numerator and denominator exist in the cache (`rec`, `tgt`) but no function divides them | Verified |
| Carry share | Not computed | Carries are per player | No team-carry denominator is built | Verified |
| QB attempts | Selected, not used as a team tendency | `weekly_stats.data.attempts` is copied into `data_cache` as `att` | `usage()` never reads `att` | Verified |
| Team pass/run tendency | Not computed | Player attempts and carries are present | No team-week pass rate or rush rate | Verified |
| Air yards share and WOPR | Selected, unused in the rate | `air_yards_share`, `wopr` in `db_pull.py` | Not inputs to `usage()` or `trend_mult()` | Verified |
| Recent workload vs season baseline | Partial | Snaps, target share, opportunity (targets + carries) | The trend window is last 2 games vs all earlier games in the loaded season, not vs a fixed prior season | Verified |
| Opponent performance vs a position | Computed, not a published defense ranking | nflverse weekly fantasy points | `defense_factors()`: half-PPR points allowed to QB/RB/WR/TE, divided by that defense's weeks, divided by the league average, shrunk by `g / (g + 8)`, then clipped to 0.92–1.08 (`fantasy/project.py`) | Verified |
| Next-week outlook | Computed projection | ESPN weekly projection when ESPN expects the player to play; otherwise the season rate | This week does not get the opponent factor again, because the code treats ESPN's weekly number as already including the matchup (`fantasy/project.py` module note; `fantasy/engine.py` build) | Verified |
| Rest-of-season outlook | Computed projection | ESPN season projection blended with observed points per game | Prior length K is 4 RB, 6 WR, 10 QB and TE games. Later weeks multiply by the clipped opponent factor and by availability. Playoff weeks 15–17 are weighted 1.5× in the browser value, not in the raw weekly rate (`docs/decision-model.md`, `web/src/engine/value.ts` as described there) | Verified in `fantasy/project.py` for the blend and clip. The 1.5× weight is documented in `docs/decision-model.md` and was not re-read line by line in `value.ts` for this audit |
| ESPN season vs weekly projections | Yes | Private ESPN fantasy API, league cookies | `fantasy/espn_league.py` pulls `kona_player_info`. `engine.py` reads stat source 1 / split 0 as the season total and stat source 1 / split 1 as the week. Actuals are stat source 0. Documented limitation: the season projection is today's number only (`docs/decision-model.md`) | Verified in code for the stat-source read; the "today only" limitation is from the decision-model doc, which says it was checked on 2026-10-18 |
| Injuries and practice status | Yes | nflverse `load_injuries` | `injuries` table. Current-week questionable play chance uses the first four characters of `practice_status` (Full 75%, Limited 63%, Did not practice 50%, default 63%) | Verified |
| Live score, game summary, one-book spread/total on the board | Yes, display | Unofficial ESPN site JSON | `web/src/board/load.ts` fetches `/espn/apis/site/v2/sports/football/nfl/scoreboard` and `.../summary?event=`. Nightly `espn_ingest.py` upserts the scoreboard into `espn_scoreboard`. The board comment says the spread and total are one book's price | Verified |
| Multi-book spreads and totals | Yes, when a key is set | The Odds API | `odds_ingest.py` requests `markets=totals,spreads`, region `us`, and inserts a row per event per market. Each pull is a new `pulled_at`, so history is whatever this app has stored, not a backfill | Verified in code. The README's "free tier ~500 req/mo" is a comment in `README.md` and `odds_ingest.py`. **The vendor's current quota and license were not retrieved** |
| Player props and historical prop lines | No | Odds ingest does not request them | Not stored | Verified |
| Play-by-play, routes, coverage, pressure | Not ingested | `docs/nfl-stats-app-plan.md` says play-by-play is a later table | `nflverse_ingest.py` does not call a play-by-play loader | Verified |
| Sleeper adds/drops | Yes | `https://api.sleeper.app/v1/players/nfl/trending/{add\|drop}` | `sleeper_trending`. Waiver score uses the latest pull's counts. Not a snap or target source | Verified |
| Player id crosswalk | Yes | nflverse `load_ff_playerids` | `players`: gsis primary key, `sleeper_id`, `espn_id`, full row in `data` including `pfr_id` | Verified |
| League rosters | Yes | ESPN private league API | `espn_league_rosters` and the fantasy JSON. Cookies, not a public stats feed | Verified |

Labels on the player card (`web/src/components/PlayerProfile.tsx`, `web/src/components/StatRail.tsx`) show carries per game, targets per game, target share, and snap percent. They do not show catch rate, carry share, or a team pass/run split.

Supabase is the database, not a football dataset. The app writes the tables above into a project the operator creates (`README.md`).

## Comparison of requested sources

Every external row is **not retrieved**. Commercial-use status is therefore "unknown — do not assume." Relevance is only "could matter if the docs say so," not a score.

| Source (as requested) | Data type | Coverage | Access method | Commercial-use status | Relevance to the requested features |
|---|---|---|---|---|---|
| https://fantasydata.com/nfl | Not retrieved | Not retrieved | Not retrieved | Unknown | Candidate commercial NFL feed. Not used in this repo |
| https://sportsdata.io/nfl-api | Not retrieved | Not retrieved | Not retrieved | Unknown | Candidate commercial NFL API. Not used in this repo |
| https://endzoneapi.com/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Candidate hosted API. Not used in this repo |
| https://the-odds-api.com/sports/nfl-odds.html | Not retrieved from the vendor site | Not retrieved | This repo calls `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds` for spreads and totals only | Unknown. Repo comment says a free tier of about 500 requests/month; that comment is not a license | Already used for game lines. Player props are not requested |
| https://www.footballdb.com/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced in ingest |
| https://nflsavant.com/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced in ingest |
| https://www.teamrankings.com/nfl/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced in ingest |
| https://www.espn.com/nfl/stats | Not retrieved | Not retrieved | The app uses other ESPN hosts (site API, core API proxy, fantasy `lm-api-reads`), not this stats page | Unknown for that page. League access in this repo is cookie-authenticated and unofficial from the app's point of view (`espn_ingest.py` calls the scoreboard "unofficial, undocumented") | Page itself is not a feed the app calls |
| https://nextgenstats.nfl.com/stats/top-plays/fastest-ball-carriers | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced. Tracking metrics (routes, separation, pressure) are a gap in the app |
| https://www.pro-football-reference.com/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Not fetched. Snap rows are keyed by a PFR player id that arrives inside the nflverse snap file |
| https://rollcoverage.com/sources | Not retrieved | Not retrieved | Not retrieved | Unknown | Name suggests a source list, not a feed. Not opened |
| https://github.com/nflverse/nflverse-data | Not retrieved | Not retrieved | Not retrieved | Unknown. A GitHub repo license was not read, and a repo license would not by itself license the underlying NFL data | Likely related to the package this app already imports. Relationship not confirmed from upstream docs in this run |
| https://github.com/nflverse/nfldata | Not retrieved | Not retrieved | Not retrieved | Unknown | Same caution |
| https://github.com/nflverse/espnscrapeR-data | Not retrieved | Not retrieved | Not retrieved | Unknown | Same caution. This repo does not import `espnscrapeR` |
| https://nflfastr.com/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Same caution |
| https://nflreadr.nflverse.com/index.html | Not retrieved | Not retrieved | The Python ingest imports `nflreadpy`, not the R package `nflreadr` | Unknown | Documentation for the R twin of the loader this app uses. Not opened |
| https://opensourcefootball.com/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced in code |
| https://www.ffverse.com/# | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced in code |
| https://github.com/ffverse | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced in code |
| https://dynastyprocess.com/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced in code |
| https://github.com/dynastyprocess | Not retrieved | Not retrieved | Not retrieved | Unknown | Not referenced in code |
| https://github.com/noahowsh/endzoneapi-mcp | Not retrieved | Not retrieved | Not retrieved | Unknown | MCP wrapper. Not a dataset until its upstream is verified |
| https://github.com/api-evangelist/sportsdataio | Not retrieved | Not retrieved | Not retrieved | Unknown | API description repo, not a data license |
| https://jthomasmock.github.io/espnscrapeR/ | Not retrieved | Not retrieved | Not retrieved | Unknown | Package docs. Not opened |
| https://github.com/orgs/nflverse/repositories?type=all | Not retrieved | Not retrieved | Not retrieved | Unknown | Org index, not a dataset |

### How the links group, without confirmed identity

These groups are **name groupings from the URLs in the request**. They are not a finding that the sites share a database, a license, or an update schedule.

- **nflverse family (unconfirmed):** `nflverse-data`, `nfldata`, `espnscrapeR-data`, `nflfastr.com`, `nflreadr.nflverse.com`, `opensourcefootball.com`, and the nflverse GitHub org. This app's verified touchpoint is the Python package `nflreadpy` (`nflverse_ingest.py`), which loads player ids, player stats, injuries, snap counts, and schedules.
- **SportsDataIO / FantasyData (unconfirmed):** `fantasydata.com` and `sportsdata.io`, plus `github.com/api-evangelist/sportsdataio`. Whether FantasyData is a product line of SportsDataIO was not checked.
- **ffverse (unconfirmed):** `ffverse.com` and `github.com/ffverse`.
- **dynastyprocess (unconfirmed):** `dynastyprocess.com` and `github.com/dynastyprocess`.
- **espnscrapeR (unconfirmed):** `nflverse/espnscrapeR-data` and `jthomasmock.github.io/espnscrapeR`. The app's ESPN access is its own HTTP client, not this package.
- **Endzone (unconfirmed):** `endzoneapi.com` and `noahowsh/endzoneapi-mcp`. The GitHub repo is a client. The site would be the data source if the docs say so.
- **The Odds API:** one provider. The HTML page was not retrieved. The app already calls one documented-in-code endpoint for two markets.
- **Reference sites and dashboards, pending a look at their docs:** FootballDB, NFL Savant, TeamRankings, the ESPN NFL stats page, the Next Gen Stats top-plays page, Pro Football Reference, and Roll Coverage's sources page. None of them is called by this repository. Until their terms are fetched, treat them as pages a person can read, not as feeds the app may copy.

## Metric coverage the app does not have

These are gaps in **this repository**, not claims that a vendor lacks the field.

| Gap | What the code does today |
|---|---|
| Route participation | No route or alignment table |
| Player-on-field participation beyond offensive snap counts | Snap file is offense snap count and offense percent. No defensive snap, special-teams snap, or package (11 personnel, slot) is selected |
| Coverage and pressure | No charting fields |
| Catch rate | Can be calculated later as `receptions / targets` on weeks where targets are greater than zero. Not implemented |
| Carry share | Can be calculated later as player carries divided by the sum of teammate carries in that team-week. Not implemented. A share that uses only skill-position carries will not match an official team rush share |
| Team pass/run tendency | Can be calculated later from play-by-play (pass attempts and rushes on designed plays) or, more roughly, by summing player attempts and carries. Summing player carries double-counts nothing if each carry has one rusher, but sacks, scrambles, and kneels need a play-level definition. Not implemented |
| Opponent vs role | The opponent factor is points allowed to a **position**, shrunk and clipped. It is not points allowed to slot receivers, early-down backs, or goal-line backs |
| Projections from a second vendor | The prior is ESPN's fantasy projection plus observed scoring. No FantasyPros, nflverse, or betting projection is blended |
| Historical player-prop odds | Not requested and not stored |
| Closing line vs current line | `schedules.data` selects `spread_line` and `total_line` from the nflverse schedule. `odds` stores each Odds API pull. The stats plan describes comparing them. That comparison is a plan (`docs/nfl-stats-app-plan.md`), not a statement that both series are complete history |

### Why opponent history is a weak projection

The app already treats a defense's points allowed as a small adjustment, and the code says why. `defense_factors()` shrinks the raw ratio toward 1 with weight `g / (g + 8)` and then clips it to 0.92–1.08. `fantasy/project.py` records that this factor moved replay mean absolute error by at most 0.01. Four weeks of scorecard in `docs/decision-model.md` (weeks 2–5) did not show a meaningful gain over ESPN's own weekly projection.

A matchup table of "defense vs RB" is a small sample even when the season is finished: one defense has roughly one game a week, and the points in that game depend on who the opponent was, game script, weather, and injuries. Splitting further by role (third-down back, slot receiver) makes the sample smaller. That history can describe what already happened. It is not, by itself, a rest-of-season projection. The app's own split keeps those ideas apart: observed weekly stats and snaps are history; `proj` and `rate` are a blend that starts from ESPN's projection and only nudges later weeks by a capped opponent factor.

## Stacks

### Low-cost prototype

Stay on the sources this repository already runs. That is a recommendation about **integration that exists**, not a statement that those sources' licenses allow a public product.

1. **nflverse through `nflreadpy`** for weekly player stats, snap counts, injuries, schedules (including the schedule's spread and total fields), and the gsis / sleeper / espn / pfr id map.
2. **ESPN fantasy reads with the operator's cookies** for this league's projections, actual fantasy points, ownership, and rosters.
3. **ESPN site scoreboard and summary** for the games board, labeled unofficial in `espn_ingest.py`.
4. **Sleeper trending** for waiver demand.
5. **The Odds API**, only while a key is set, for current multi-book spreads and totals. Do not add player-prop markets until the vendor page is read and the monthly request budget is confirmed.
6. **Supabase** as storage.

Calculated next, still from nflverse rows already pulled, if a prototype player page needs them:

- Catch rate = `receptions / targets` for player-weeks with targets > 0. Season rate uses the same sums over the season. Recent rate uses the last two weeks with targets. Do not average weekly rates; sum numerator and denominator.
- Carry share = player `carries` / sum of `carries` for that team-week. Same season and last-two windows.
- A rough pass/run split = team `attempts` / (team `attempts` + team `carries`) for the week. Label it as a box-score split, not a play-by-play play-call rate, until a play file defines scrambles, sacks, and kneels.

Do not add FootballDB, TeamRankings, Pro Football Reference pages, Next Gen Stats pages, ffverse, or dynastyprocess for the prototype. They are not in the pipeline, and their terms were not read.

### Production-ready stack

**No production stack is recommended in this audit.** A public or commercial app needs the vendor's own terms for display, redistribution, attribution, and caching. Those pages were not fetched. Paying for SportsDataIO, FantasyData, or Endzone before that reading would duplicate data the prototype already gets from nflverse and ESPN without answering the license question.

When the research job can run, the production set to evaluate is:

- One licensed NFL statistics feed that documents snaps, targets, carries, and player ids, if nflverse's data terms do not allow the product.
- One odds feed that documents player props and historical lines, if The Odds API's terms do not.
- Keep ESPN only where the product is allowed to show ESPN's projections. The current integration uses private league cookies and undocumented public JSON. That is a personal-league pattern, not a commercial contract.

Overlap to avoid: nflverse weekly stats plus a commercial box-score feed plus Pro Football Reference will describe the same catches and carries three times. Pick one system of record for observed stats. Use a second source only for a field the first source does not have (tracking, props, or a licensed projection).

### Smallest set that covers the product goals

For a private prototype, the smallest set is the one already integrated: **nflverse player stats and snaps, ESPN fantasy projections, ESPN scoreboard for live context, and The Odds API for game lines.** Sleeper is for waivers, not for the player-page metrics.

That set still does not cover route participation, coverage, pressure, or historical player props. Those need a source whose documentation was not retrieved. Do not fill them by scraping the reference sites.

## Questions to resolve before a public or commercial app

Ask these from the vendor's current terms. This list is not an answer.

1. Does the **dataset** license allow commercial display, or only non-commercial research? A package's MIT or Apache license does not answer this.
2. Is redistribution of the raw file forbidden even when showing derived numbers is allowed?
3. What attribution is required, and on which screens?
4. Are player images, ESPN text, or sportsbook prices sublicensable?
5. What is the historical window for snaps, participation, and props, and how soon after a game do they update?
6. Which player id is stable (gsis, pfr, espn, sleeper), and what happens when a player changes teams?
7. Are projections point-in-time (the number published before the game) or overwritten each day? The app already treats ESPN's season projection as the latter (`docs/decision-model.md`).
8. For The Odds API: which markets include NFL player props, is history sold separately from the live pull, what does the free tier allow today, and may odds be stored and shown?
9. For any "free" community dataset: who owns the collection, and what did the upstream site prohibit?
10. For ESPN's undocumented scoreboard: is there a supported API the product should use instead?

## Sources

Web research output: none. No external URL was fetched, so none is cited as evidence for a vendor fact.

Repository evidence:

- `README.md` data-source table
- `docs/decision-model.md` (last verified against code 2026-10-18, per that file)
- `docs/nfl-stats-app-plan.md`
- `schema.sql`
- `nflverse_ingest.py`
- `odds_ingest.py`
- `sleeper_ingest.py`
- `espn_ingest.py`
- `fantasy/db_pull.py`
- `fantasy/engine.py`
- `fantasy/project.py`
- `fantasy/espn_league.py`
- `web/src/board/load.ts`
- `web/src/board/normalize.ts`
- `web/src/components/PlayerProfile.tsx`
- `web/src/components/StatRail.tsx`
- `/agent/repos/nfl-fantasyv2/README.md`
