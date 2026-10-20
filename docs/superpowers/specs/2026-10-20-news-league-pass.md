# News and League pass

Date: 2026-10-20. Screens `#news` and `#league`. Games files are untouched.

## News

Filters are Popularity, Date, Player news, and Team news. Opening order is Date.

A card shows the headline and a preview. The preview is the first two to four sentences of the item's own text. One sentence stays one sentence. A headline with no separate text gets no preview. No model writes the preview.

Popularity is the tagged player's ESPN rostered percent. Sleeper adds break a tie. The feed has no popularity field. An item with no tagged player in the league file has no signal and sorts after scored items.

Date is newest published time first. Missing times follow.

Player news has a player tag. Team news is tagged to a team, or not tied to a single player. An item with no player and no team is team news. A player tag wins when both are present. Player and team views are newest first.

Two columns on a wide screen, one column at 760px and under. Preview type is smaller than the headline.

## League

Rows follow win percentage, with a tie counting as half a win, then points for. The league file has no playoff-seed field. Team id only stops the order from flickering. `myTeamId` is marked.

The rank grid prints QB, RB, WR, TE, Flex, Bench, and Lineup. Cells touch. Rank 1 is the brightest gold.

The title board shows record, title percent, points for, points against, games left, lineup points per week, weekly spread, opponent lineup points per week, seed now, playoff percent, and bye percent.

Title, playoff, and bye percents are whole numbers from this run of `simulate()`. They move about ±2 points between runs. Lineup, spread, and opponents are the scores that run draws. Seed now is the standings place. The sim starts from the current record and points for and does not re-score finished games. Points against is not an input.
