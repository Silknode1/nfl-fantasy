# NFL stats app: scores, replays, and odds as decision support

This is a plan, not a build. It describes a statistics product that sits next to the fantasy desk in this repo. The product shows what happened, what the market expects the game to look like, and how that information would change a lineup, waiver, or trade decision.

It does not take bets, hold a balance, recommend a wager, or shop for a price. Odds are a forecast of the game environment. The action on the other side of that forecast is a fantasy decision the desk already knows how to score.

## Who it is for

One manager, in this half-PPR league, during the week and on Sunday. The questions:

- What is the score right now, and is my player in the game?
- Was that stat a role or a one-play spike?
- Does the game script (favorite, underdog, high total, low total) agree with this week's expected points?
- If the role is real, does it change his trade value, or only this week's box score?

## What already exists

| Need | Source in this repo | Stored as | Cadence today |
|---|---|---|---|
| Live score | `espn_ingest.py` scoreboard, unofficial ESPN JSON | `espn_scoreboard` (`event_id`, `season`, `week`, `data`, `pulled_at`) | nightly, plus Sunday morning |
| Final score, closing spread and total | nflverse schedules via `fantasy/db_pull.py` | `schedules.data` (`spread_line`, `total_line`, `home_score`, `away_score`) | nightly |
| Current spreads and totals, several books | `odds_ingest.py`, The Odds API, markets `spreads` and `totals` | `odds` (`event_id`, `market`, `pulled_at`, `data.books`) | nightly, skipped when `ODDS_API_KEY` is unset. Free tier is about 500 requests a month |
| Weekly fantasy points, snaps, injuries | nflverse pulls | `weekly_stats`, `snap_counts`, `injuries` | nightly |
| This week's expected points, chance to play, rest-of-season rate | `fantasy/engine.py` + `fantasy/project.py` | `web/public/data/fantasy.json` fields `proj`, `projIf`, `playP`, `rate` | each fantasy build |
| Trade value | `web/src/engine/value.ts` | computed in the browser from `proj` | each page load |

Play-by-play is not ingested yet. nflverse publishes it after games, not as a live feed. Live drive text would be a later addition on top of the same ESPN scoreboard payload, which already carries drives when ESPN includes them.

## Entities

- **Game.** One row per NFL game. Keys: season, week, home, away, kickoff, status (scheduled, in progress, final). Joins `schedules.game_id` to `espn_scoreboard.event_id` by teams and week, because the two feeds do not share an id.
- **ScoreState.** Home and away points, quarter, clock, possession, last play text. Taken from the latest `espn_scoreboard.data`. `pulled_at` is the freshness stamp. A state older than a few minutes during a window is labeled stale.
- **Play.** One offense play after the game: down, distance, yard line, type (pass, run, scramble), player ids, yards, touchdown, turnover. Source: nflverse play-by-play, ingested into a new `plays` table keyed by `game_id, play_id`. Not live.
- **MarketQuote.** One book, one market, one pull. Markets in scope: spread (home line and price), total (over/under and price). Moneyline can ride along in `data` later; it is not required for the decision below. Primary key already exists on `odds`.
- **Consensus.** Median spread and median total across books on the latest pull. The high-low range is disagreement, not a second forecast. A market with one book is shown as a single quote, not a median.
- **ImpliedTeamTotal.** `(consensus total + team's spread-from-the-team's-perspective) / 2`, rounded to 0.5. The favorite's number is higher. This is the environment signal.
- **PlayerWeekProjection.** The desk's number: expected points (`proj`), points if he plays (`projIf`), chance to play (`playP`), rest-of-season rate (`rate`). Half PPR, this league's scoring.
- **TradeValue.** `production − replacement` from `value.ts`. Production is weighted points per week from next week through week 17, playoff weeks × 1.5. Replacement is QB12, RB30, WR30, or TE12.

## Screens

### Scoreboard

A week strip, then one row per game. Each row: teams, score, quarter and clock, spread and total from the latest consensus (or "no quote"), and a freshness time.

Clicking a team expands the fantasy-relevant skill players on that offense: name, position, this week's expected points, chance to play, and whether he has registered a stat yet. Expected points come from `fantasy.json`, not from a second model.

Empty state: no scoreboard pull. Show the schedule from `schedules` and say the live feed has not arrived.

### Game

The scoreboard row, then two columns.

Left, while the game is on: drives and the last few play descriptions from the ESPN payload, if present. Each fantasy skill player lists targets, carries, and fantasy points so far against his expected points. The comparison is "ahead / behind his expected," not a win probability for a bet.

Left, after the game: the replay strip. Plays that touch a skill player (target, carry, reception, drop, touchdown, fumble) in order, filterable by player. A target on 3rd-and-long and a 2-yard score from the 2 both count as a catch; the strip is how the user tells them apart. Snap share for the game, once `snap_counts` has the week, sits under the strip.

Right, always: the odds panel for this game. See below.

### Odds board

A page of every game in the week. Columns: away, home, consensus spread, consensus total, each team's implied total, number of books, high-low range. Sort by implied total so the highest-scripted offenses are at the top.

A game opens the same odds panel as the game screen:

- Consensus spread and total, with each book's number behind a disclosure. The price (for example −110) is shown so the user can see the quote is a market price. It is not turned into a recommended bet.
- Movement: this pull versus the first pull of the week stored in `odds`, and versus `schedules.data.spread_line` / `total_line` once that closing number exists. "The total moved from 44.5 to 47" is the sentence. "Bet the over" is not.
- Implied team total next to that offense's season-average total, computed from games already played in `schedules` (points scored, not the market). The gap is the script versus what this team has been.

No bet slip, no stake, no payout, no account, no "edge" or "expected value" of a wager.

### Player decision card

Opened from a name on the scoreboard, the replay, or the odds board. It reuses the fantasy player's projection and trade value rather than inventing a third number.

- This week: expected points, points if he plays, chance to play, bye or out.
- Environment: his team's implied total, the gap versus that team's recent scoring, and a one-line script note (see the rules below).
- Role: season target share or carries, last-two-game trend, and, once the replay exists, the plays from his last game.
- Trade value: surplus over the replacement player, and the rest-of-season pace underneath it. A 30-point Sunday does not by itself change trade value; the card says so. Trade value moves when the weekly projection for the remaining weeks moves (usage, injury, news), which the nightly fantasy build already does.

## How the odds change a decision

The fantasy model already multiplies later weeks by opponent points allowed, shrunk and clipped to ±8%, and it does not apply that factor again on the current week when ESPN published a weekly projection. The market total is a different fact: how many points the game is expected to contain, which ESPN's player projection may already partly reflect. The app therefore does not add the total on top of `proj`. It shows agreement or disagreement, and it tells the user which decision that disagreement belongs to.

Rules, all of them labels rather than a new points formula:

1. **Implied total at least 3 points above that offense's recent average.** Script note: "more plays than this offense has been getting." Relevant comparison: two receivers or two tight ends in the same flex decision. Prefer the player in the higher implied total when their expected points are within 2. The 2-point band is the noise in a weekly projection (replay MAE is about 5), so this is a tie-break, not an override.
2. **Implied total at least 3 points below that offense's recent average.** The mirror note. Do not sit a player solely because the total is low if he is more than 2 expected points ahead of the alternative.
3. **Team is favored by 7 or more.** Script note for running backs: "clock-killing game, carries more likely than targets." Script note for quarterbacks and receivers: "the lead can shorten the passing game." Same tie-break rule. Do not apply it to a back who does not play on early downs; the replay and snap share are how the user checks that.
4. **Team is an underdog by 7 or more.** The mirror: more dropbacks, fewer early-down carries.
5. **Books disagree by more than 1 point on the spread or 1.5 on the total.** Show "quotes disagree" and do not emit a script note. A noisy market is not a signal.
6. **No quote, or the pull is from before the last injury report.** Show "no environment note." Do not invent a total from the season schedule line if a current pull is missing; the schedule line is the closing or the nflverse line and can be days old. Label it as such when it is the only number on the page.

The output of a note is a sentence on the decision card and, when the user is choosing a lineup, a marker on the player who gets the tie-break. It does not change `proj` until a later experiment shows the note would have reduced weekly error. That experiment is the Tuesday projection scorecard, with the note logged as a separate column, not folded into the projection in advance.

Trade decisions use the note only as context. A better script this week does not increase trade value. The card can say "this week's environment is friendly; his surplus over a replacement receiver is still +2.4 because the rest of the season did not change."

## How projections and trade value show up

- Scoreboard and game pages read `proj[week]`, `playP`, and `projIf[week]` for the current week. They do not recompute them.
- The decision card reads `tradeOf(player)` so the surplus, the replacement level, and the player's own pace stay the same numbers as the roster screen.
- After a game is final, store actual fantasy points next to `proj` (the existing `player_week_projections.actual` path). The game page shows the miss. That is the feedback for whether the environment note was pointing at a real difference.
- Replays explain the miss. A receiver who was projected for 14 and scored 4 on two targets is a role story. The same receiver who scored 4 on nine targets is a variance story. Only the role story is a reason to look at trade value again after the next build.

## Build order

1. **Scoreboard.** Read `espn_scoreboard` and `schedules`. Refresh the scoreboard every minute from the first kickoff until the last game is final on Sunday, and a few times on Monday night. Keep the nightly job for the rest of the week. Show freshness. No odds math yet; show the schedule's spread and total labeled as the nflverse line.
2. **Join the fantasy file.** On each scoreboard player, show expected points and chance to play from the latest `fantasy.json`. This is a read of data the desk already publishes.
3. **Odds board.** On the days The Odds API budget allows (a morning pull and a late-week pull, not a poll), write `odds` as today and render consensus, range, and implied team total. Budget: two markets × about 16 games is a handful of rows per pull, and one HTTP request per pull. Two pulls a day across a season stays inside the free tier. If the key is missing, the board says so and step 1 still works.
4. **Decision notes.** Implement the six rules as a pure function of (implied total, recent offense points, spread, projection gap, book range). Unit-test each rule, including "quotes disagree" and "no quote." Do not write the note back into `proj`.
5. **Replay.** After nflverse play-by-play for the week is available, ingest `plays` and ship the filterable strip. Until then the game page uses ESPN's drive text only, labeled as the live feed's description rather than a full play log.

Steps 1–4 are useful without step 5. Step 5 is the one that needs a new table.

## What would prove a piece wrong

- **Scoreboard.** If `pulled_at` is routinely more than five minutes behind a game clock during the Sunday window, the refresh is not live and should not be labeled live.
- **Odds.** If the median of two books differs from a third book by more than a point as often as it agrees, stop calling it a consensus and show the books separately.
- **Decision note.** On the weekly scorecard, players who received a positive script tie-break should not have a worse mean absolute error than players who did not. If they do, across a few weeks, delete the note. Do not tune the 3-point and 7-point cutoffs against the same weeks that suggested them.
- **Replay.** If play counts for a finished game do not match nflverse for that `game_id`, do not show the strip.

## Explicitly out of scope

- Deposits, balances, bet placement, parlay builders, or odds shopping.
- A probability that a bet wins, a closing-line edge, or any sentence that tells the user to bet.
- Replacing the fantasy projection with a market-implied fantasy points model. The market informs the note. The projection stays the projection until the scorecard says otherwise.
- Player props. They are a betting market for the player's fantasy line, which is the thing this plan is refusing to productize. The desk's own expected points are the prop.
