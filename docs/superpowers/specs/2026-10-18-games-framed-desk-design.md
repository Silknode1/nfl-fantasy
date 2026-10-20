# Games framed desk

Date: 2026-10-18. Superseded for the Games screen by `2026-10-20-games-ticker-desk.md`. The notes below describe the ring desk this page used to be.

The Games screen (`#games`, and `#game/{id}` as a deep link) is one desk. The selected game is the center. The rest of the week is a ring.

## What the desk shows

The ring is every other game this week: top, right, bottom, left on a wide desktop. A ring card shows the clubs, the score or the kickoff, the clock or status line, possession and red zone when the ESPN situation object has them, the home spread, and a watch mark. A gold dot (`--up`) means someone on the user's fantasy roster is in that game. The match is the fantasy player's ESPN id when the record has one, otherwise the displayed name. Clicking the card swaps it into the center. The previous center game goes back to the ring. Nothing on the card expands to full width, and the old "Open game" control is gone.

Default center: the live game with the most of the user's roster players. If none are live, the next kickoff. If the slate is over, the most recently kicked off final. A one-game week has no ring; the center uses the full width. When the week is long (more than eight games), ring cards sit on one line and the ring scrolls. The center keeps a readable width. Type on this desk and on the right shelf is larger (about 18px for secondary text, larger for scores and club names). The rest of the app is unchanged.

`#game/{id}` opens this same desk with that game selected.

## Three center states

The top line is the site and a Watch button. Watch opens the broadcaster's site in a new window: YouTube TV, Prime Video, ESPN, ESPN+, NBC, CBS, FOX, ABC, NFL Network, and Peacock. The ESPN broadcast name is mapped to that site. The page does not embed YouTube TV, Prime Video, or a live NFL stream, and it does not upload or rehost a broadcast.

Before kickoff the article leads. Under it: kickoff, where to watch, the spread, total, and moneyline, injuries, and the user's players with this week's `proj`. If ESPN's pregame matchup predictor is present, it is one dot. There is no drawn history.

Live: score, possession, red zone, and the clock. Under the score, ESPN's in-game win-probability series is a line, labeled as ESPN's model, and only when the summary payload includes that series. If the series is missing, the desk shows the current percentage when ESPN published one (the last play, or the pregame predictor) and the sentence "The play-by-play line has not arrived." It does not invent points. The left column is scoring plays, then drives. The right column is the user's players, standouts from the box score, injuries, the market, and headlines on this summary. Clips sit at the bottom. The article uses the score, the margin against the number, scoring-play text, injuries, projections, and headlines that are actually present.

Final uses the same layout, frozen. The line keeps the whole series if one arrived. The article is the recap, from those same fields.

Recent results already on `TeamContext.recent` are a strip. A week opens a small window with that result and any headline stored on the event. If there is no headline, the window says so.

## Numbers

Shown: scoreboard teams, score, kickoff, venue, broadcast, spread, total, moneyline. The scoreboard still refreshes about once a minute. If live ESPN fails, the last board stays up and is labeled saved, and the center says the line block failed. The selected game's summary refreshes about every 15 seconds while that game is live. Other games are not polled at that rate.

Possession, red zone, and clock come from the situation object. Drives, play-by-play, and scoring plays come from the summary. Half-PPR points so far are this league's scoring weights applied to the box-score stat keys (passing and rushing and receiving yards and touchdowns, interceptions, receptions, fumbles lost, two-point conversions when those keys are present). They sit next to `proj` and are labeled as different numbers. A fast start does not replace the weekly projection.

The margin against the spread is `(home score − away score) + home line`. Home's line is negative when home is favored, so a 17–7 game with home −7 is "covering by 3". That is arithmetic. The desk does not calculate or display a chance to cover. A missing quote stays the sentence that a missing quote is not a number to invent.

The article is phrasing over those fields. A headline that was not gathered is left out. The desk does not invent a cause.

## Clips and the shelf

Public YouTube search is not called. There is no key in the environment, and this desk does not add one. Clips are links the user pastes, plus a static YouTube search link for the two clubs. A bad paste is named as a clips failure. Thumbnails do not autoplay when a game becomes the center. Play runs that game's stack in order and loops until pause. Leaving the center pauses the stack and remembers the position. Coming back shows the still, and play resumes there. Pinning a clip pauses the center. The shelf copy arrives paused on its thumbnail. Playing a shelf clip pauses the center. Only one of them has sound.

The right shelf is a stack. Pinning adds. Newest is on top. Kinds: player, video, news item, team, game article. Opening a pinned player still shows the week chart, usage, and news. Unpin removes that item. Video pins stay paused until play.

## Out of scope

No cover probability, no bet slip, no edge, no expected value of a wager. Odds stay a market price.
