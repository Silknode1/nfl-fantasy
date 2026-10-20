# Games ticker desk

Date: 2026-10-20. This replaces the ring layout in `2026-10-18-games-framed-desk-design.md` for `#games` and `#game/{id}` only. Other screens keep the left nav.

## Page

Top to bottom, Games only:

1. The section nav is a horizontal bar. The left nav is not on this page, so the week can use the width. Every other screen keeps the left nav.
2. The full week is three ticker rows, or four when the week has more than twelve games. Nothing from the slate sits under the selected game.
3. The selected game is wide, in two bordered columns.
4. A narrow shelf on the right collapses to a strip.

Desktop type on this page is larger (about 18px for body text, larger for scores, the spread, and club names).

`#game/{id}` opens the same desk with that game selected. The default game is unchanged: the live game with the most of the user's roster players, else the next kickoff, else the most recent final.

## Search

Search marks games. It does not remove any game from the week, and it does not change the selection. Enter opens the first match in live-first order. Escape clears the box.

The previous page selected `board.games.find(matchGame)` on every keystroke. Deleting a query walked through partial strings. "s" matches the first kickoff-order club whose name contains that letter, so a selected live 49ers game was replaced and then sat in a clipped ring slot. Clearing the box left that new selection in place, which looked like the live game had vanished. The ticker lists every game in the current week, live games first in the top rows, and clearing search keeps the selected id.

## Ticker

A bubble shows team abbreviations, the score (or "at" before kickoff), the home spread when a quote was pulled, and Final or the clock. The spread spot is empty when no line was pulled. The row is symmetrical: away abbreviation, score in the middle, home abbreviation. Spread and the smaller status word sit on a second line under the score.

The bubble background is a left-to-right gradient of the two clubs' colors, away to home, under a black scrim so the white score clears 4.5:1. A small mark in the top-right means one of the user's roster players is in that game.

Rows alternate direction. Speeds differ and drift. Hover or keyboard focus pauses a scrolling row. Bubbles are buttons. `prefers-reduced-motion` turns auto-scroll off and leaves the row manually scrollable.

The moving part of a row is duplicated for the loop. Only one copy is in the tab order. Both copies select the same game id. On first load the real copy sits in the viewport, so bubbles are not clipped before they move.

Live games are highlighted, placed in the top rows, and kept outside the scrolling track so they stay on screen and clickable. The rest of those rows still scroll.

## Selected game

Two columns. Sections have their own borders.

Main column, in order: ESPN's win-probability graph, the headline, standouts, scoring plays, then the rest (the short article from fields that are present, then drives, then clips).

The graph's vertical axis is win percentage. The horizontal axis is time remaining in the quarter and in the game, with quarter marks, when the series can be placed on the clock. The leading team's abbreviation and current win percentage sit beside the latest point. The line is drawn only when ESPN sent a series. No series: the sentence "The play-by-play line has not arrived." No points are invented. A series whose plays have no clock is drawn in play order and the axis says so.

Scoring plays are listed once, in order. A small field diagram is drawn only when ESPN sent both ends of the play. The description is the play text. No diagram when field position is missing.

The spread is a large figure in the second column. If no line was pulled, that spot is empty. Total, moneyline, and the margin against the number appear only from a quote that was actually pulled. The margin is score minus the spread, not a forecast and not a cover probability.

Watch still opens the broadcaster's site. The page does not embed a live NFL stream.

## Shelf

My players in this game are a collapsible tab, not a main column. Points so far (half-PPR from box-score keys that are present) sit next to the week projection and are labeled as different numbers.

League-wide news is a second collapsible tab. It can be filtered by club and by headline text. Headlines come from the same pull as the news screen. Nothing is written in when that pull is empty.

Games are added with one control, a small button labeled exactly "Pin Game". Newest pin is on top. A pinned game from another week says it is not on this week's board.

## Clips

The YouTube search link and the paste box stay. The selected-game query is "{Home} vs {Away} week {N} preview". The team-page query is "{Team} Football week {N}". A pasted link is kept, and when YouTube's oEmbed returns a title and channel those become a signal for which results belong here (same channel, then same kind). Nothing plays until Play. Thumbnails stay still until then.

The top 3 are fetched through the dev server at `/yt/search` with `publishedAfter` set to the start of the current NFL week and `maxResults` 3. The key is `YOUTUBE_API_KEY`, read only in the Vite process. It is not in the client bundle. With no key, the proxy answers `{ configured: false }` and the page says "The top-3 list needs a YouTube key." No video id or title is invented.

## Numbers

Shown only when the feed already has them: scoreboard teams, score, kickoff, venue, broadcast, spread, total, moneyline, ESPN win probability, yard lines on scoring plays. The scoreboard still refreshes about once a minute and falls back to the saved board. The selected summary refreshes about every 15 seconds while that game is live.

No cover probability, no betting edge, no expected value of a wager.
