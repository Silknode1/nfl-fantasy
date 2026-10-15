# Decision model: how the Carney Carnival desk decides

Last verified against the code: 2026-10-15. Code wins over this doc. If they disagree, fix the doc.
Tags: **[V]** verified in code or data · **[A]** assumption, never tested · **[P]** planned, not built

## League (ESPN 1065732, "The Creature Conglomerate") [V]
- 12 teams, redraft, half PPR. Lineup: 1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX (RB/WR/TE). 7 bench, 2 IR.
- FAAB $100, minimum bid $1. Claims process about 2 AM CT every day except Tuesday. Dropped players sit on waivers for 24 hours.
- 14 regular-season weeks. 6 playoff teams, seeds 1–2 get byes, playoffs in Weeks 15–17. Seeding by wins, then points for.
- Trade deadline Dec 4, 2026. 6 veto votes; ESPN's 48-hour review setting.
- The user's team is id 4, "Carney Carnival". Objective: win the title. Playoff weeks count 1.5× (`PLAYOFF_WEIGHT`).

## Pipeline
| Step | Where | What it does |
|---|---|---|
| Pull | `fantasy/espn_league.py` | Private league views (cookies), 700 players with projections, free agents, transactions |
| Pull | `fantasy/db_pull.py` | Supabase: weekly_stats, snap_counts, players (ID crosswalk), schedules, sleeper_trending, jev_judgments, news_items |
| Trends | `fantasy/trends.py` | Sleeper adds/drops for 6h, 12h, 24h, 48h, 3d and 7d; ESPN rostered-% movers |
| Project | `fantasy/engine.py` | Player rate, weekly projections, spread → `web/public/data/fantasy.json` |
| Log | `fantasy/history.py` | `league_transactions`, `player_week_projections` (`app_live`); `fantasy_snapshots` holds the full output |
| Decide | `web/src/engine/*.ts` (browser) | Lineups, season simulation, trades, waivers, advice |
| Schedule | `.github/workflows/refresh.yml` → `run_nightly.py` | 10:58 AM and 5:58 PM CT daily, plus Sunday 9:35 AM |

## Projection (`engine.py`) [V]
- Points per game when active = (gp × observed ppg + 6 × ESPN prior) / (gp + 6). The ESPN prior is 0.6 × ESPN's this-week projection + 0.4 × ESPN's season projection / 17. If the player isn't expected to play this week, the prior is the season rate alone.
- × usage trend: last 2 games vs earlier, capped at ±6% [A: weights untested].
- × Jev role multiplier: ±4%, applied only when the news judgment is firm (p ≥ 0.6) [A].
- Week projection = rate × opponent factor × availability.
  - Opponent factor: points the defense allows to the position, shrunk with weight g/(g+8), capped at 0.85–1.15 [A].
  - Availability: IR = out 4 weeks, OUT = out 1 week, unless a Jev-read news timeline says otherwise [A].
- Spread (sd) = CV[pos] × rate, blended 50/50 with the player's own spread once he has 3+ games. CV: QB 0.38, RB 0.50, WR 0.55, TE 0.60 [A].
- Floor/ceiling shown in the app = projection ± 1.2816 × sd, floor not below 0. This normal shape ignores the chance a player doesn't play at all [A].

## Decision engine (TypeScript) [V]
- **Value unit.** Weighted starting points per week from next week through Week 17, playoff weeks × 1.5 (`playerValue`, `outlook`).
- **Lineup.** Greedy best lineup, which is optimal for this slot structure.
- **Simulation** (`sim.ts`): 3,000 seasons with fixed random draws (seed 20261011).
  - Team week score = projected lineup points + sd × z + 5 × season-long strength error. Played weeks use actual points.
  - Title odds move about ±2 points between data refreshes, even when nothing important changed.
- **Trades** (`trade.ts`):
  - Search: 1-for-1, 2-for-1 and 3-for-1, about 10,000 candidates.
  - Rosters made legal by dropping the lowest-value player, or adding the 5th-best free agent for each open spot.
  - Every piece offered must be worth 3.5+ pts/week. Each side must keep a QB and a TE.
  - Score = Δ weighted pts/week + 0.2 × Δ title odds (points). Grade cutoffs: A+ ≥ 4, A ≥ 3, A- ≥ 2.2, B+ ≥ 1.5, B ≥ 1.0, B- ≥ 0.6, C+ ≥ 0.25, C ≥ −0.25, … F < −2.2 [A]. The two terms overlap, because title odds are computed from the same weekly points.
  - Acceptance = logistic(−0.8 + 1.0 × partner lineup Δ + 0.3 × ESPN-perceived value Δ), with a 1.15 premium on what the partner gives up, clipped to 3–95%. **Never validated** [A].
  - Ranking = my gain × acceptance. Counteroffers: best package per subset of the original ask that adds ≥ 0.5 pts/week at ≥ 30% acceptance. Deals under 10% are flagged "likely decline".
  - The partner's title odds are not considered, so helping a rival scores the same as helping a 0-5 team.
- **Waivers** (`waivers.ts`):
  - Score = 0.4 × fit + 0.35 × hype + 0.15 × role trend + 0.1 × value + 0.08 handcuff bonus [A].
  - Fit counts starting points only, so a deep bench makes every add look like zero.
  - FAAB bid = budget share by rank (22%, 12%, 6%, 3%, 1%) [A].

## Data sources
| Source | Kind | Point-in-time? | Notes |
|---|---|---|---|
| ESPN weekly projection (statSource 1, split 1) | projected | yes: past weeks retrievable | Scored with league settings |
| ESPN season projection | projected | **no**: only today's version | Leaks into backfills (see findings) |
| ESPN actuals (statSource 0) | observed | yes | |
| nflverse weekly stats, snaps (Supabase) | observed | yes, by week | No projections in nflverse |
| Sleeper trending | observed | logged from Oct 2026 | Counts across all Sleeper leagues |
| ESPN rostered % / weekly change | observed | current only | Global, not this league |
| Jev judgments on ESPN news | inferred | yes (`judged_at`) | Coverage starts in October |
| `league_transactions` | observed | yes | Full season backfill. Other teams' trades show only accept/decline events, without players |
| `player_week_projections` | logged | yes | `app_live` from Oct 15; `app_replay` weeks 1–5 |

ID joins: ESPN id ↔ gsis ↔ sleeper id through the `players` table. Some Sleeper-to-ESPN matches are by name; DEF/K coverage is partial.

## Findings so far
- **Projection backtest, weeks 2–5** (point-in-time replay vs ESPN's weekly projection, players ESPN projected > 3 pts):

  | Week | App avg miss | ESPN avg miss | App rank corr | ESPN rank corr |
  |---|---|---|---|---|
  | 2 | 4.85 | 4.87 | 0.567 | 0.571 |
  | 3 | 4.95 | 4.94 | 0.587 | 0.592 |
  | 4 | 5.02 | 5.08 | 0.568 | 0.555 |
  | 5 | 5.30 | 5.15 | 0.546 | 0.576 |

  The app's adjustments show no measurable gain over ESPN yet. Four weeks is too few to conclude more.
- **Leakage demo.** The backfill that uses today's ESPN season projection "beats" ESPN in weeks 2–4 (MAE 4.46 vs 4.87 in week 2), and the edge vanishes by week 5. Use `app_replay`, never `app_replay_hindsight`, for evaluation.
- **Backfill fidelity.** Replaying the app formula reproduces the real snapshots for weeks 5–6 with MAE 1.15 pts and rank correlation 0.92 (point-in-time version).
- **Trade base rate through Week 6:**
  - One accepted trade in the league: Uncle Beef gets Puka Nacua from Mike_ Ditka_89 for Parker Washington, J.K. Dobbins and Colston Loveland. Accepted Sep 29, processed Oct 1.
  - The user's roughly 15 offers: 0 accepted.
  - Uncle Beef is the most active trader: offered to the user on Sep 29, made the Ditka deal, and has declined at least two offers.
  - The model's 20–45% acceptance estimates look optimistic against this base rate.

## Known weaknesses (ranked by decision impact)
1. The acceptance model is untested and drives every trade ranking.
2. The partner's title odds and rival effects are ignored.
3. The trade score double-counts (weekly points + title odds derived from them).
4. Waiver fit ignores insurance and upside; bid shares are arbitrary.
5. The availability rules (IR/OUT durations) and backup promotion are crude. When Hurts was out, McKee stayed projected as a backup.
6. Floor/ceiling ignores the chance of not playing.
7. Recommendations have gone out on stale data (before a waiver run). Every output needs a freshness stamp.
8. Combined-offer simulations don't refill open roster spots the way single-trade evaluation does.

## Planned [P]
- Position-specific prior strength; bye-aware playoff weight; expected-points blend; opponent cap ±8%; consensus projection blend.
- Acceptance recalibration from logged offers; per-manager activity priors.
- Fill `actual` on `app_live` rows after games (or a view joining actuals) so live projections are scored weekly.

## Decision log
- 2026-10-11: Counteroffer finder and "likely decline" flag added.
- 2026-10-13: Fixed `weekAdvice` swap pairing.
- 2026-10-15: Waiver pulse, range chart, `trends.py`. Transaction and projection logging. Weeks 1–5 backfill. Code committed.
