# Waiver and trade ranking

Date: 2026-10-20. League ESPN 1065732, 12 teams, half PPR, lineup QB / 2 RB / 2 WR / TE / 2 FLEX, 7 bench, 2 IR, FAAB $100. Team 4 is Carney Carnival. From `web/public/data/fantasy.json` (generated 2026-10-18, week 6): 5–0, 535.7 points for, $47 FAAB left, waiver priority 11. Playoff weeks count 1.5×. Code wins where this note and `docs/decision-model.md` ever differed; the doc was updated to the code below.

No offers are sent. No claims are filed. Acceptance stays an unvalidated estimate and does not sort either board.

## What was wrong in the waiver formula

`rankWaivers` in `web/src/engine/waivers.ts` did two different things and then sorted by neither of the right ones.

The drop was the lowest `playerValue` on the active roster, any position. For this team that player is Efton Chism, a bench receiver, and every claim was labeled as a cut of him. The points number was then

```
gain = outlook(roster − that player + add).weighted − outlook(roster).weighted
```

When the cut is a bench player, that happens to equal the lineup change. When the lowest raw score is a starter at another position, his lost points are subtracted from every add, except from an add at his own position, who replaces him and does not pay the penalty. That is not "the added player minus the player who leaves that slot." It is a raw-points cut averaged across positions, then a lineup recomputed around the cut.

The board did not sort by `gain`. It sorted by

```
score = 0.4 × clamp(gain / 3) × (0.7 + 0.6 × need) + 0.35 × hype + 0.15 × role trend + 0.1 × clamp(value / 14) + handcuff
```

`need` is `(position rank − 1) / 11`. Carney Carnival is 12th at quarterback, so `need` is 1 and the fit term is multiplied by 1.3. The last term is the player's own weighted points, which are higher for quarterbacks, divided by 14. On the cached wire that order was Geno Smith (+2.45), Malik Willis (+1.69), then Keon Coleman (+0.03) because of hype, then Tanner McKee (+0.10) ahead of receivers who do not move the lineup. Seven quarterbacks were the only positive lineup gains, and the blend pulled extra quarterbacks up with them.

## Waiver rule now

Points per week is `outlook(roster + add) − outlook(roster)`, with nobody cut first. The name next to it is the starter who is out of the lineup most often after the add. Playoff weeks stay at 1.5×. The roster cut, when one is named, is the lowest bench player and is not part of the subtraction.

The returned list is ordered by that delta. On screen the default order is within-position rank (QB, RB, WR, TE at each rank), and the same board sorts by lineup delta, hype, fit, or role. Fit on the meter is the lineup delta scaled by 3 points.

The 40 / 35 / 15 / 10 blend is still computed from real inputs (lineup fit, Sleeper adds and ESPN rostered change, usage trend, the player's own points, plus the handcuff flag). Those weights were never fit to results. The 10% term repeats points already inside the lineup delta, so it does not sort the board and it does not include title odds.

FAAB is a share of the dollars left, by lineup-delta rank: 22%, then 12%, 6%, 3%, and 1%. Those shares are arbitrary. The old extra multiplier `(0.6 + 0.8 × score)` is gone.

## What was wrong in the trade mix

`candidates()` still builds the same 1-for-1, 2-for-1, and 3-for-1 set (11,629 deals on this file). The grade is unchanged: `Δ weighted pts/week + 0.2 × Δ title odds`, with the same letter cuts. Before this pass, `pick` and the Best tab sorted by `my gain × acceptance`.

Quarterback upgrades are worth about +4 to +6.5 weighted points a week because Cousins is the weak starter. Skill-position swaps in the same search top out around +3. Every kept row of 1-for-1, 2-for-1, and 3-for-1 was "get a quarterback." Acceptance, which has never been checked against a trade the league actually made, was doing part of that sort.

## When a quarterback appears

`composeTradeBoard` keeps the lineup score and changes who is allowed onto the list.

- The list is deals whose received players are RB, WR, or TE, ordered by the lineup score. A package that gives a quarterback in order to receive a skill player stays in this tier.
- A deal that receives a quarterback is included only when `qbIsShort(lineupNeeds)` is true. The best such deal by the same score is one row at the end. It is not the board.
- When the needs list does not include QB, a quarterback-only swap is absent.

Acceptance is still shown, labeled as an estimate. Deals at or under 10% are still left off the recommended lists. The counteroffer finder still uses its old acceptance floor. That finder is not the board order.

## Needs list

`lineupNeeds` reads the current rosters. It does not use a handwritten list. For each starter in the best lineup by weighted points per week:

- Injury, when the starter is questionable, doubtful, out, or on IR, or `playP` is under 0.75. The gap is the weighted lineup points lost if he is removed and the backup enters.
- Bye, when `bye` is between next week and week 17. The gap is that week's lineup points with a typical week filled back in, minus the projected lineup, times the week's weight, divided by the total weight from next week through week 17.
- Hole, when his weighted points per week sit at least 1.0 under the league median starter at that slot. The gap is median minus his value.

On this file the list leads with Cousins, a 5.5 point hole at QB, then Mike Evans (questionable, 50% to play, about 4.2 points if he leaves). QB need is therefore true, and each trade tab ends with one quarterback target under the skill swaps.

## Breaking news

My Team reads the feed already in the app: Jev headlines on the roster, ESPN headlines, and scoreboard lines. A row is shown only when it matches a roster player by ESPN id, or by name when the id is missing, and the text says he left the game or is out (Achilles, left the game, ruled out, cart, did not return, placed on IR, and the same kind of phrase), and the timestamp is inside the last 7 days. A scoreboard line with no timestamp counts as this week. If nothing matches, the strip is not rendered. The Evans sentence is not in the app.
