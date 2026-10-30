# Decision model: how the Carney Carnival desk decides

Last verified against the code: 2026-10-20. Code wins over this doc. If they disagree, fix the doc.
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

## Projection (`engine.py`, `fantasy/project.py`) [V]
- Two priors. The rest-of-season prior is ESPN's season projection / 17. The this-week prior is 0.6 × ESPN's this-week projection + 0.4 × that season rate, and only when ESPN expects him to play (weekly projection > 0.3 and status is active, questionable, or day-to-day). Otherwise both priors are the season rate. This week's matchup does not leak into later weeks.
- Points per game when active = (gp × observed ppg + K × prior) / (gp + K). K is 4 for RB, 6 for WR, 10 for QB and TE [A: direction from the weeks 2–5 scorecard, which found that blending observed scoring helped RB and hurt QB/TE; the lengths are not a fit].
- × usage trend: last 2 games vs earlier, capped at ±6% [A: weights untested].
- × Jev role multiplier: ±4%, applied only when the news judgment is firm (p ≥ 0.6) [A].
- This week = this-week rate × availability. ESPN's weekly number already includes the opponent, so the defense factor is not applied again. A game that already has an actual keeps that projection in `proj`. The actual stays in `actual` and is not shown as the projection. Weekly points are floored at 0 so the expected week cannot sit under the floor. The rest-of-season rate is the blend and can be slightly negative for a backup with negative scoring and an ESPN prior near 0; that rate is not a weekly projection.
- A later week = rest-of-season rate × opponent factor × availability. Bye, free agent, or no game = 0.
  - Opponent factor: points the defense allows to the position, shrunk with weight g/(g+8), capped at 0.92–1.08 [A: the wider ±15% cap moved replay MAE by at most 0.01].
  - Availability (`availability()` returns chance he plays, points multiplier if he plays, note). Out = 0 for 1 week, IR = out 4 weeks, unless a Jev-read news timeline says otherwise [A]. **Questionable** (current week): plays 75% / 63% / 50% by practice report (full / limited / did not practice), scores ~88% of usual if he plays. **Doubtful**: 3% to play. [V, measured on 2025 + 2026 wk 3–5: 287 questionable, 20 doubtful, 311 out player-weeks; doubtful and out never played; questionable 63% played, 88% of usual when playing]. QBs listed questionable played only 25% (24 cases): not special-cased yet. `proj` = expected (chance × points); `projIf` = points if he plays; the Desk's Expected / If he plays toggle swaps one for the other.
- Spread (sd) = CV[pos] × rate, blended 50/50 with the player's own spread once he has 3+ games, and not below 0. CV: QB 0.38, RB 0.50, WR 0.55, TE 0.60 [A]. A negative rate does not produce a negative spread.
- Floor/ceiling shown in the app = projection − 1.57 × sd and + 2.09 × sd (10th/90th percentile), floor not below 0 [V, fitted on replay weeks 2–3, held-out weeks 4–5: 11.9% below floor, 14.8% above ceiling; the old ±1.2816 × sd missed 19.2% / 21.7%]. The sd itself is ~1.45× too small (actual error sd ÷ model sd = 1.38–1.53 at every position) and outcomes skew high, hence the asymmetric multipliers. Still ignores the chance a player doesn't play at all [A]. Pooled across positions; per-position fits are too noisy at this sample size.

## Decision engine (TypeScript) [V]
- **Value unit.** Weighted starting points per week from next week through Week 17, playoff weeks × 1.5 (`playerValue`, `outlook`). This is production, not trade value.
- **Trade value** (`web/src/engine/value.ts`). Surplus = that same weighted pts/week minus the replacement player at the position. Replacement is QB12, RB30, WR30, TE12 in this 12-team league (one QB and one TE per team; RB and WR go deeper because of two starters plus the flex). A shorter pool uses the last player. The same raw points are worth more where the replacement scores less. There is no extra position multiplier. Negative surplus means a replacement player is projected higher. Bye and injury weeks are already inside the weekly projection. Lineup gain is still what grades a specific trade; this number is the player-level comparison.
- **Lineup.** Greedy best lineup, which is optimal for this slot structure. The lineup sd adds a fixed 10-point term in quadrature (`+ 100` inside the sqrt in `lineup.ts`) [A].
- **Simulation** (`sim.ts`): 3,000 seasons with fixed random draws (seed 20261011).
  - Team week score = projected lineup points + sd × z + 5 × season-long strength error. Played weeks use actual points.
  - Title odds move about ±2 points between data refreshes, even when nothing important changed.
- **Trades** (`trade.ts`, `needs.ts`):
  - Search: 1-for-1, 2-for-1 and 3-for-1, about 10,000 candidates.
  - Rosters made legal by dropping the lowest-value player, or adding the 5th-best free agent for each open spot.
  - Every piece offered must be worth 3.5+ pts/week. Each side must keep a QB and a TE.
  - Score = Δ weighted pts/week + 0.2 × Δ title odds (points). Grade cutoffs: A+ ≥ 4, A ≥ 3, A- ≥ 2.2, B+ ≥ 1.5, B ≥ 1.0, B- ≥ 0.6, C+ ≥ 0.25, C ≥ −0.25, … F < −2.2 [A]. The two terms overlap, because title odds are computed from the same weekly points. The letter grade still uses this score.
  - The board order is that score inside a skill-position tier. The player received is RB, WR, or TE. A QB target is one extra row, and only when `lineupNeeds` says the lineup is short a QB. Giving a QB to receive a skill player stays in the skill tier. Acceptance does not sort the board.
  - Needs (`lineupNeeds`): injury or play probability under 75% (weighted lineup points lost if that starter leaves), a bye inside the value window (that week's lineup hit, divided into the weighted per-week total), and a hole (the starter's weighted pts/week below the league median at that slot). The name is the player who would leave.
  - Acceptance = logistic(−0.8 + 1.0 × partner lineup Δ + 0.3 × ESPN-perceived value Δ), with a 1.15 premium on what the partner gives up, clipped to 3–95%. **Never validated** [A]. Shown as an estimate. It is a floor for recommended deals (at or under 10% are dropped) and it still ranks counteroffers.
    - The intercept alone gives 31%: of the Stevenson 3-for-1's 38%, about 31 points are the constant.
    - The value is computed in the browser and **never saved**, so past offers' predictions must be rebuilt from the snapshot before each offer.
  - Double count, worked example (Stevenson 3-for-1): 1.33 pts/wk + 0.2 × 2.8 title points = 1.89, a B+. On weekly points alone it would be a B.
  - Counteroffers: best package per subset of the original ask that adds ≥ 0.5 pts/week at ≥ 30% acceptance. Deals under 10% are flagged "likely decline".
  - The partner's title odds are not considered, so helping a rival scores the same as helping a 0-5 team.
- **Waivers** (`waivers.ts`):
  - Points per week = change in the best lineup's weighted points if the player is added and nobody else is cut. The starter displaced most often is who leaves that slot. The roster cut is the lowest bench player and is not subtracted. [V]
  - The board sorts by that delta, or on screen by within-position rank, hype, fit, or role. It does not sort by the blend.
  - An arbitrary blend is still computed: 0.4 × fit + 0.35 × hype + 0.15 × role trend + 0.1 × the player's own points + 0.08 handcuff. Fit is the lineup delta divided by 3. The weights were never fit to results. The 10% term repeats points already inside the lineup delta, so it does not rank the board. [A]
  - FAAB bid = a share of the budget by lineup-delta rank (22%, then 12%, 6%, 3%, 1%). The shares are arbitrary. [A]

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
1. The acceptance model is untested. It no longer sorts the trade board. It still drops deals at or under 10% and it still ranks counteroffers.
2. The partner's title odds and rival effects are ignored.
3. The trade score double-counts (weekly points + title odds derived from them).
4. Waiver bids are an arbitrary share of the budget by lineup-delta rank. The 40/35/15/10 blend is still computed and still arbitrary; it does not sort the board.
5. The availability rules (IR/OUT durations) and backup promotion are crude. When Hurts was out, McKee stayed projected as a backup.
6. Floor/ceiling ignores the chance of not playing.
7. Recommendations have gone out on stale data (before a waiver run). Every output needs a freshness stamp.
8. Combined-offer simulations don't refill open roster spots the way single-trade evaluation does.

## Planned [P]
- Consensus projection blend (position-specific prior strength and the ±8% opponent cap shipped 2026-10-18; playoff weeks already count 1.5× and byes already zero the week).
- Acceptance recalibration from logged offers; per-manager activity priors.
- Log the model's acceptance % and the user's gut estimate at the moment an offer is sent.
- Hindsight-ceiling check before any waiver-model work: how many points would perfect picks have added?
- Fill `actual` on `app_live` rows after games (or a view joining actuals) so live projections are scored weekly.

## Decision log
- 2026-10-11: Counteroffer finder and "likely decline" flag added.
- 2026-10-13: Fixed `weekAdvice` swap pairing.
- 2026-10-15: Waiver pulse, range chart, `trends.py`. Transaction and projection logging. Weeks 1–5 backfill. Code committed.
- 2026-10-16: Projection scorecard (replay weeks 2–5): app ties ESPN (MAE 5.01 vs 5.00); usage trend, Jev and opponent factor each move MAE ≤0.01 (Jev untestable, 1 of 925 rows); blending observed scoring helps RB, hurts QB/TE. Floor/ceiling widened to 1.57/2.09 sd (see above). Weekly scorecard task runs Tuesdays 12:19 PM CT.
- 2026-10-16: Injury availability recalibrated from data (questionable 63%/88%, doubtful 3%, was 70% and 25%); Desk gains Expected / If-he-plays toggle and fPPG, last-3, app-projection columns.
- 2026-10-15: Skill evals found the B+ double count, the 31% intercept share, and that acceptance isn't persisted.
- 2026-10-18: Weekly points split this week from the rest of the season (ESPN's week no longer leaks forward, and the opponent factor is not applied twice). Prior length is 4/6/10 games for RB/WR/QB+TE. Opponent clip tightened to ±8%. Player trade value is rest-of-season points per week above QB12/RB30/WR30/TE12. Not yet re-scored on the Tuesday scorecard.
- 2026-10-27: A played week no longer copies the actual into `proj`. Weekly points and the spread are floored at 0. The rest-of-season rate is left as the blend when that blend is slightly negative.
