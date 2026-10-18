import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  formatAmerican,
  gameFromSummary,
  groupByWindow,
  impliedTeamTotals,
  movementSentences,
  priceSentence,
  quoteFromSummary,
  type Board,
  type BoardGame,
  type GameContext,
  type GameQuote,
  type Side,
} from './board/normalize'
import { fetchSlate, fetchSummaryRaw, fetchTeamParts, summaryContext, type Slate } from './load'
import {
  dedupeHeadlines,
  drivesFrom,
  headlinesFromSummary,
  keyTeamStats,
  leadersFromSummary,
  rankedFacts,
  seasonLinesFrom,
  type Drive,
  type Headline,
  type LeaderLine,
  type RankedFact,
  type SeasonLine,
  type TeamStatBlock,
} from './story'
import { parseTeamView, type TeamGame, type TeamView } from './team'

type Screen = 'board' | 'news' | 'stats' | 'game' | 'team'
type WeekChoice = 'current' | 'previous'

interface Route {
  screen: Screen
  id?: string
}

interface Bundle {
  drives: Drive[]
  headlines: Headline[]
  stats: TeamStatBlock[]
  leaders: LeaderLine[]
  season: SeasonLine[]
  context: GameContext
}

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; slate: Slate }
type Extra = BoardGame | 'error' | 'loading'
type TeamState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; view: TeamView }

const WEEK_KEY = 'fieldglass-week'
const NAV = [
  { id: 'board', label: 'Scoreboard' },
  { id: 'news', label: 'News' },
  { id: 'stats', label: 'Stats' },
] as const

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === 'news') return { screen: 'news' }
  if (hash === 'stats') return { screen: 'stats' }
  if (hash.startsWith('game/')) {
    const id = decodeURIComponent(hash.slice('game/'.length))
    if (id) return { screen: 'game', id }
  }
  if (hash.startsWith('team/')) {
    const abbr = decodeURIComponent(hash.slice('team/'.length)).trim().toUpperCase()
    if (/^[A-Z]{2,3}$/.test(abbr)) return { screen: 'team', id: abbr }
  }
  return { screen: 'board' }
}

function readChoice(): WeekChoice {
  try {
    return sessionStorage.getItem(WEEK_KEY) === 'previous' ? 'previous' : 'current'
  } catch {
    return 'current'
  }
}

function storeChoice(choice: WeekChoice) {
  try {
    sessionStorage.setItem(WEEK_KEY, choice)
  } catch {
    /* session storage can be blocked; the choice still lasts for this visit */
  }
}

function bundleOf(raw: unknown, game: BoardGame): Bundle {
  return {
    drives: drivesFrom(raw),
    headlines: headlinesFromSummary(raw, { id: game.id, name: game.name }),
    stats: keyTeamStats(raw),
    leaders: leadersFromSummary(raw),
    season: seasonLinesFrom(raw),
    context: summaryContext(raw, game),
  }
}

function withQuote(game: BoardGame, quotes: Record<string, GameQuote>): BoardGame {
  if (game.quote || !quotes[game.id]) return game
  const quote = quotes[game.id]
  const implied = quote.total != null && quote.homeSpread != null ? impliedTeamTotals(quote.total, quote.homeSpread) : null
  return { ...game, quote, implied }
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function fmt(n: number | null): string {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function wins(record: string): number {
  const n = Number(record.split('-')[0])
  return Number.isFinite(n) ? n : -1
}

function quarter(n: number | null): string {
  if (n == null) return ''
  if (n >= 1 && n <= 4) return `Q${n}`
  if (n === 5) return 'OT'
  return `OT${n - 4}`
}

function clubCodes(name: string | null): string[] {
  if (!name) return []
  return name
    .split(/\s+(?:@|VS)\s+/i)
    .map((part) => part.trim().toUpperCase())
    .filter((part) => /^[A-Z]{2,3}$/.test(part))
}

function priceLines(game: BoardGame): string[] {
  const quote = game.quote
  if (!quote) return []
  const lines: string[] = []
  if (quote.away.moneyline != null) {
    lines.push(`${game.away.name} ${formatAmerican(quote.away.moneyline)}. ${priceSentence(quote.away.moneyline)}.`)
  }
  if (quote.home.moneyline != null) {
    lines.push(`${game.home.name} ${formatAmerican(quote.home.moneyline)}. ${priceSentence(quote.home.moneyline)}.`)
  }
  return lines
}

function Mark({ side }: { side: Side }) {
  return side.logo ? <img src={side.logo} alt="" width={40} height={40} /> : <span className="logo-fallback">{side.abbr.slice(0, 1)}</span>
}

function TeamLink({ side }: { side: Side }) {
  const href = side.abbr && side.abbr !== '—' ? `#team/${encodeURIComponent(side.abbr)}` : '#board'
  return (
    <a className="teamlink" href={href}>
      <span className="gswatch" style={{ background: side.color }} aria-hidden />
      <Mark side={side} />
      <span className="gname">
        <b>{side.abbr}</b>
        <small>{side.name}{side.record ? ` · ${side.record}` : ''}</small>
      </span>
    </a>
  )
}

function FactStack({ game, linked }: { game: BoardGame; linked: boolean }) {
  const facts = rankedFacts(game)
  const body = (
    <>
      {linked ? <span className="sr">Open {game.name}</span> : null}
      {facts.map((fact) => (
        <FactLine key={fact.kind} fact={fact} />
      ))}
      <span className="fact-status">{game.state === 'pre' ? 'Open game' : game.detail}</span>
    </>
  )
  if (!linked) return <div className="facts">{body}</div>
  return <a className="facts" href={`#game/${encodeURIComponent(game.id)}`}>{body}</a>
}

function FactLine({ fact }: { fact: RankedFact }) {
  if (fact.kind === 'score') {
    return (
      <span className="fact fact-score" data-fact="score">
        {fact.text.split(' · ').map((line) => <b key={line}>{line}</b>)}
      </span>
    )
  }
  return <span className={`fact fact-${fact.kind}`} data-fact={fact.kind}>{fact.text}</span>
}

function NextStop({ links }: { links: { href: string; label: string }[] }) {
  if (!links.length) return null
  return (
    <nav className="next" aria-label="Next">
      <span>Next</span>
      {links.map((link) => <a key={`${link.href}-${link.label}`} href={link.href}>{link.label}</a>)}
    </nav>
  )
}

function Scoreboard({ board, spreadsLoading }: { board: Board; spreadsLoading: boolean }) {
  const week = board.week ? `Week ${board.week}` : 'This week'
  if (!board.games.length) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h2>{week} scoreboard</h2>
          <p>No games were on this pull.</p>
        </div>
        <NextStop links={[{ href: '#news', label: 'News' }, { href: '#stats', label: 'Stats' }]} />
      </div>
    )
  }
  const groups = groupByWindow(board.games)
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>{week} scoreboard</h2>
        <p>The score, or the kickoff, comes first. The point spread is next. The total is a price, not a suggestion.</p>
        {spreadsLoading ? <p className="note">Closing spreads are still loading for games that did not include one.</p> : null}
      </div>
      {groups.map((group) => (
        <section key={group.label} className="window">
          <h3>{group.label}</h3>
          <div className="cards">
            {group.games.map((game) => (
              <article key={game.id} className="gcard">
                <div className="gteams">
                  <TeamLink side={game.away} />
                  <TeamLink side={game.home} />
                </div>
                <FactStack game={game} linked />
                {game.note ? <p className="gnote">{game.note}</p> : null}
              </article>
            ))}
          </div>
        </section>
      ))}
      {board.byes.length > 0 && (
        <p className="byes">
          Bye:{' '}
          {board.byes.map((team, index) => (
            <span key={team.abbr}>
              {index > 0 ? ', ' : ''}
              <a href={`#team/${encodeURIComponent(team.abbr)}`}>{team.abbr}</a>
            </span>
          ))}
        </p>
      )}
      <NextStop links={[{ href: '#news', label: 'News' }, { href: '#stats', label: 'Stats' }, { href: `#game/${encodeURIComponent(board.games[0].id)}`, label: board.games[0].name }]} />
    </div>
  )
}

function DriveList({ drives, game }: { drives: Drive[]; game: BoardGame }) {
  return (
    <ol className="drives">
      {drives.map((drive) => {
        const teamHref = /^[A-Z]{2,3}$/.test(drive.team) ? `#team/${encodeURIComponent(drive.team)}` : null
        return (
          <li key={drive.id} className="drive">
            <header>
              {teamHref ? <a href={teamHref}><b>{drive.team}</b></a> : <b>{drive.team}</b>}
              <span>{drive.result}</span>
              {drive.summary ? <small>{drive.summary}</small> : null}
            </header>
            {drive.plays.length > 0 && (
              <ol className="plays">
                {drive.plays.map((play) => (
                  <li key={play.id} className={play.scoring ? 'scoring' : undefined}>
                    <span className="clock">{[quarter(play.quarter), play.clock].filter(Boolean).join(' ') || '—'}</span>
                    <span className="down">{play.down}</span>
                    <span className="play-text">{play.text}</span>
                    {play.scoring && play.awayScore != null && play.homeScore != null && (
                      <span className="play-score">{game.away.abbr} {play.awayScore} · {game.home.abbr} {play.homeScore}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function GameView({ game, bundle }: { game: BoardGame; bundle: Bundle | 'error' | undefined }) {
  const started = game.state !== 'pre'
  const loaded = bundle && bundle !== 'error' ? bundle : null
  const where = [game.venue, game.city, game.broadcast, game.neutral ? 'Neutral site' : null].filter(Boolean).join(' · ')
  const headlines = loaded?.headlines ?? []
  const leaders = loaded && loaded.leaders.length ? loaded.leaders : game.leaders.map((leader) => ({ label: leader.label, name: leader.name, value: leader.stat, team: '' }))
  const sides = loaded ? [loaded.context.away, loaded.context.home] : []
  const hasFigures = Boolean(loaded && (loaded.stats.length || leaders.length || sides.some((side) => side.recent.length)))
  const prices = priceLines(game)
  const moves = movementSentences(game)
  return (
    <div className="screen">
      <a className="back" href="#board">Scoreboard</a>
      <header className="panel match">
        <div className="match-grid">
          <div className="gteams">
            <TeamLink side={game.away} />
            <TeamLink side={game.home} />
          </div>
          <FactStack game={game} linked={false} />
        </div>
        {prices.length > 0 && (
          <ul className="prices">
            {prices.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
        {moves.length > 0 && <p className="where">{moves.join(' ')}</p>}
        {game.quote?.book ? <p className="where">Price listed by {game.quote.book}.</p> : null}
        {where ? <p className="where">{where}</p> : null}
      </header>

      <section className="panel">
        <h2>Play by play</h2>
        {bundle === undefined && <p className="loading">Loading the plays</p>}
        {bundle === 'error' && <p className="empty">The plays didn't load. The score is still above, and both teams have their own pages.</p>}
        {loaded && loaded.drives.length === 0 && (
          <p className="empty">
            {started ? 'Play-by-play is not on this pull.' : `This game has not started. Kickoff is ${game.detail || 'not listed'}.`}
          </p>
        )}
        {loaded && loaded.drives.length > 0 && <DriveList drives={loaded.drives} game={game} />}
      </section>

      <section className="panel">
        <h2>Team figures</h2>
        {bundle === undefined && <p className="loading">Loading figures</p>}
        {bundle === 'error' && <p className="empty">Team figures didn't load. The team pages may still have them.</p>}
        {loaded && !hasFigures && <p className="empty">No team figures on this pull.</p>}
        {loaded && loaded.stats.length > 0 && (
          <div className="statgrid">
            {loaded.stats.map((block) => (
              <div key={block.abbr} className="statblock">
                <h3><a href={`#team/${encodeURIComponent(block.abbr)}`}>{block.abbr}</a></h3>
                <dl>
                  {block.rows.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
        {sides.some((side) => side.recent.length > 0) && (
          <ul className="fives">
            {sides.filter((side) => side.recent.length).map((side) => (
              <li key={side.abbr}>
                <a href={`#team/${encodeURIComponent(side.abbr)}`}><b>{side.abbr}</b></a>
                <span>{side.recent.map((gameRow) => gameRow.result || '—').join(' ')}</span>
                <small>{side.avgPoints != null ? `${fmt(side.avgPoints)} pts over the last five` : 'Last five'}</small>
              </li>
            ))}
          </ul>
        )}
        {leaders.length > 0 && (
          <ul className="leaders">
            {leaders.map((leader) => (
              <li key={`${leader.label}-${leader.name}`}>
                <small>{leader.label}{leader.team ? ` · ${leader.team}` : ''}</small>
                <b>{leader.name}</b>
                <span>{leader.value}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Headlines</h2>
        {bundle === undefined && <p className="loading">Loading headlines</p>}
        {bundle === 'error' && <p className="empty">Headlines didn't load for this game.</p>}
        {loaded && headlines.length === 0 && <p className="empty">No headlines for this game.</p>}
        {loaded && headlines.length > 0 && <HeadlineList items={headlines.slice(0, 4)} />}
      </section>
      <NextStop links={[
        { href: `#team/${encodeURIComponent(game.away.abbr)}`, label: game.away.name },
        { href: `#team/${encodeURIComponent(game.home.abbr)}`, label: game.home.name },
        { href: '#news', label: 'News' },
        { href: '#board', label: 'Scoreboard' },
      ]} />
    </div>
  )
}

function HeadlineList({ items }: { items: Headline[] }) {
  return (
    <ul className="headlines">
      {items.map((item) => {
        const clubs = clubCodes(item.gameName)
        return (
          <li key={`${item.kind}-${item.id}`} className="hcard">
            {item.kind === 'game' && item.gameName ? <small>{item.gameName}</small> : <small>League</small>}
            <h3>{item.title}</h3>
            {item.blurb ? <p>{item.blurb}</p> : null}
            <span className="hlinks">
              {item.gameId ? <a href={`#game/${encodeURIComponent(item.gameId)}`}>Open {item.gameName || 'the game'}</a> : null}
              {clubs.map((abbr) => <a key={abbr} href={`#team/${encodeURIComponent(abbr)}`}>{abbr}</a>)}
              {item.href ? <a href={item.href} target="_blank" rel="noreferrer">Read on ESPN</a> : null}
              {!item.gameId && !item.href ? <span className="where">No story link on this headline.</span> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function News({ slateHeadlines, bundles, pending }: { slateHeadlines: Headline[]; bundles: Record<string, Bundle | 'error'>; pending: boolean }) {
  const gathered: Headline[] = [...slateHeadlines]
  for (const bundle of Object.values(bundles)) {
    if (bundle === 'error') continue
    gathered.push(...bundle.headlines)
  }
  const items = dedupeHeadlines(gathered).sort((a, b) => Number(b.kind === 'game') - Number(a.kind === 'game'))
  const failed = !pending && Object.keys(bundles).length > 0 && Object.values(bundles).every((bundle) => bundle === 'error')
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>News</h2>
        <p>Headlines from this week's scoreboard and game summaries. A game line opens the game. A team code opens that team.</p>
      </div>
      {pending && items.length === 0 && <p className="loading">Gathering headlines</p>}
      {!pending && items.length === 0 && <p className="empty">{failed ? "Headlines didn't load." : 'No headlines on this slate yet.'}</p>}
      {items.length > 0 && <HeadlineList items={items} />}
      {pending && items.length > 0 && <p className="note">Still gathering the rest of the slate.</p>}
      <NextStop links={[{ href: '#board', label: 'Scoreboard' }, { href: '#stats', label: 'Stats' }]} />
    </div>
  )
}

interface FigureRow {
  abbr: string
  name: string
  record: string
  points: number | null
  yards: number | null
  allowed: number | null
  five: string
  avg: number | null
}

function figureRows(games: BoardGame[], bundles: Record<string, Bundle | 'error'>): FigureRow[] {
  const map = new Map<string, FigureRow>()
  const put = (abbr: string, name: string, record: string | null) => {
    if (!abbr || abbr === '—' || map.has(abbr)) return
    map.set(abbr, { abbr, name, record: record || '—', points: null, yards: null, allowed: null, five: '', avg: null })
  }
  for (const game of games) {
    put(game.away.abbr, game.away.name, game.away.record)
    put(game.home.abbr, game.home.name, game.home.record)
  }
  for (const bundle of Object.values(bundles)) {
    if (bundle === 'error') continue
    for (const line of bundle.season) {
      const row = map.get(line.abbr)
      if (!row) continue
      row.points = line.points
      row.yards = line.yards
      row.allowed = line.pointsAllowed
    }
    for (const side of [bundle.context.away, bundle.context.home]) {
      const row = map.get(side.abbr)
      if (!row || !side.recent.length) continue
      row.five = side.recent.map((game) => game.result || '—').join(' ')
      row.avg = side.avgPoints
    }
  }
  return [...map.values()].sort((a, b) => wins(b.record) - wins(a.record) || a.name.localeCompare(b.name))
}

function leadSentence(rows: FigureRow[]): string {
  const byPoints = rows.filter((row) => row.points != null).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  if (byPoints.length) {
    const top = byPoints[0]
    return `${top.name} are scoring ${fmt(top.points)} points a game. Open a team for the full page.`
  }
  const byFive = rows.filter((row) => row.avg != null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
  if (byFive.length) return `${byFive[0].name} has scored ${fmt(byFive[0].avg)} a game over the last five.`
  return 'Records from the scoreboard. Season rates fill in as each game summary arrives.'
}

function marginCallout(rows: FigureRow[]): { abbr: string; text: string } | null {
  const ranked = rows
    .filter((row) => row.points != null && row.allowed != null)
    .map((row) => ({ ...row, diff: (row.points ?? 0) - (row.allowed ?? 0) }))
    .sort((a, b) => b.diff - a.diff)
  if (!ranked.length) return null
  const top = ranked[0]
  const margin = Math.round(top.diff * 10) / 10
  const text = margin === 0
    ? `${top.name} are scoring the same number they allow, ${fmt(top.points)} a game.`
    : margin > 0
      ? `${top.name} are scoring ${fmt(margin)} more points a game than they allow.`
      : `${top.name} are allowing ${fmt(Math.abs(margin))} more points a game than they score.`
  return { abbr: top.abbr, text }
}

function Figures({ board, bundles, pending }: { board: Board; bundles: Record<string, Bundle | 'error'>; pending: boolean }) {
  const rows = figureRows(board.games, bundles)
  const callout = marginCallout(rows)
  const leaders = board.games.flatMap((game) => game.leaders)
  const seen = new Set<string>()
  const clubs = new Map<string, string>()
  for (const game of board.games) {
    if (game.home.id) clubs.set(game.home.id, game.home.abbr)
    if (game.away.id) clubs.set(game.away.id, game.away.abbr)
  }
  const uniqueLeaders = leaders.filter((leader) => {
    const key = `${leader.label}|${leader.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Stats</h2>
        <p>{leadSentence(rows)}</p>
      </div>
      {callout && (
        <a className="highlight callout" href={`#team/${encodeURIComponent(callout.abbr)}`}>
          <b>Scoring margin</b>
          <span>{callout.text}</span>
        </a>
      )}
      <section className="panel">
        <div className="table-wrap">
          <table className="figures">
            <thead>
              <tr>
                <th>Team</th>
                <th>Record</th>
                <th>PPG</th>
                <th>Yards</th>
                <th>Allowed</th>
                <th>Last five</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.abbr}>
                  <th>
                    <a href={`#team/${encodeURIComponent(row.abbr)}`}>{row.abbr}<small>{row.name}</small></a>
                  </th>
                  <td>{row.record}</td>
                  <td>{fmt(row.points)}</td>
                  <td>{fmt(row.yards)}</td>
                  <td>{fmt(row.allowed)}</td>
                  <td>{row.five || '—'}{row.avg != null ? <small>{fmt(row.avg)} pts</small> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pending && <p className="note">Season rates are still loading.</p>}
        {!pending && rows.every((row) => row.points == null) && <p className="empty">Season scoring rates were not on this pull. Records are from the scoreboard. Open a team for its own page.</p>}
        {uniqueLeaders.length > 0 && (
          <ul className="leaders">
            {uniqueLeaders.map((leader) => {
              const abbr = clubs.get(leader.teamId)
              return (
                <li key={`${leader.label}-${leader.name}`}>
                  <small>{leader.label}</small>
                  <b>{leader.name}</b>
                  <span>{leader.stat}</span>
                  {abbr ? <a href={`#team/${encodeURIComponent(abbr)}`}>{abbr}</a> : null}
                </li>
              )
            })}
          </ul>
        )}
        {board.byes.length > 0 && (
          <p className="byes">
            Bye:{' '}
            {board.byes.map((team, index) => (
              <span key={team.abbr}>
                {index > 0 ? ', ' : ''}
                <a href={`#team/${encodeURIComponent(team.abbr)}`}>{team.name}</a>
              </span>
            ))}
          </p>
        )}
      </section>
      <NextStop links={[{ href: '#board', label: 'Scoreboard' }, { href: '#news', label: 'News' }]} />
    </div>
  )
}

function MarketCard({ title, game, teamGame }: { title: string; game: BoardGame | null | undefined; teamGame: TeamGame }) {
  const opponent = teamGame.opponentAbbr && teamGame.opponentAbbr !== '—'
    ? `#team/${encodeURIComponent(teamGame.opponentAbbr)}`
    : '#board'
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p>
        {teamGame.weekLabel}
        {' · '}
        {teamGame.home ? 'vs' : 'at'}{' '}
        <a href={opponent}>{teamGame.opponentName}</a>
      </p>
      {game === undefined && <p className="loading">Loading the score and the price</p>}
      {game === null && (
        <p className="empty">
          The spread and total were not on this pull.{' '}
          <a href={teamGame.id ? `#game/${encodeURIComponent(teamGame.id)}` : '#board'}>Try the game page</a>
          {' or the '}
          <a href={opponent}>{teamGame.opponentAbbr} page</a>.
        </p>
      )}
      {game && (
        <>
          <FactStack game={game} linked />
          {game.quote ? (
            <>
              <ul className="prices">
                {priceLines(game).map((line) => <li key={line}>{line}</li>)}
              </ul>
              {movementSentences(game).length > 0 && <p className="where">{movementSentences(game).join(' ')}</p>}
              <p className="note">This is the listed price{game.quote.book ? ` from ${game.quote.book}` : ''}. It is not a side to take.</p>
            </>
          ) : (
            <p className="empty">
              No spread, total, or moneyline is listed for this game.{' '}
              <a href="#board">Scoreboard</a>
            </p>
          )}
        </>
      )}
    </section>
  )
}

function TeamPage({
  abbr,
  season,
  known,
  onGame,
}: {
  abbr: string
  season: number | null
  known: Map<string, BoardGame>
  onGame: (game: BoardGame) => void
}) {
  const [state, setState] = useState<TeamState>({ kind: 'loading' })
  const [markets, setMarkets] = useState<Record<string, BoardGame | null>>({})
  const asked = useRef(new Set<string>())

  useEffect(() => {
    let cancel = false
    setState({ kind: 'loading' })
    setMarkets({})
    asked.current = new Set()
    fetchTeamParts(abbr, season)
      .then((parts) => {
        if (cancel) return
        const view = parseTeamView(parts)
        if (!view) {
          setState({ kind: 'error', message: `The ${abbr} feed had no team to show.` })
          return
        }
        setState({ kind: 'ready', view })
      })
      .catch((err: unknown) => {
        if (!cancel) setState({ kind: 'error', message: messageOf(err, `The ${abbr} page didn't load`) })
      })
    return () => {
      cancel = true
    }
  }, [abbr, season])

  const view = state.kind === 'ready' ? state.view : null
  useEffect(() => {
    if (!view) return
    let cancel = false
    const wanted = [view.focus, view.lastFinal].filter((game): game is TeamGame => Boolean(game))
    for (const teamGame of wanted) {
      const have = known.get(teamGame.id)
      if (have?.quote) {
        setMarkets((prev) => (prev[teamGame.id]?.quote ? prev : { ...prev, [teamGame.id]: have }))
        continue
      }
      if (asked.current.has(teamGame.id)) continue
      asked.current.add(teamGame.id)
      fetchSummaryRaw(teamGame.id)
        .then((raw) => {
          if (cancel) return
          const built = gameFromSummary(raw)
          if (built) {
            onGame(built)
            setMarkets((prev) => ({ ...prev, [teamGame.id]: built }))
          } else {
            setMarkets((prev) => ({ ...prev, [teamGame.id]: have ?? null }))
          }
        })
        .catch(() => {
          if (!cancel) setMarkets((prev) => ({ ...prev, [teamGame.id]: have ?? null }))
        })
    }
    return () => {
      cancel = true
    }
  }, [view, known, onGame])

  if (state.kind === 'loading') {
    return (
      <div className="screen">
        <a className="back" href="#board">Scoreboard</a>
        <p className="loading">Loading {abbr}</p>
      </div>
    )
  }
  if (state.kind === 'error' || !view) {
    return (
      <div className="screen">
        <a className="back" href="#board">Scoreboard</a>
        <div className="panel">
          <h2>{abbr} is unavailable</h2>
          <p>{state.kind === 'error' ? state.message : 'That team page had nothing to show.'}</p>
        </div>
        <NextStop links={[{ href: '#board', label: 'Scoreboard' }, { href: '#news', label: 'News' }]} />
      </div>
    )
  }

  const focusMarket = view.focus ? markets[view.focus.id] : undefined
  const recentMarket = view.lastFinal ? markets[view.lastFinal.id] : undefined
  const showRecentPrice = Boolean(view.lastFinal && view.focus && view.lastFinal.id !== view.focus.id && focusMarket && !focusMarket.quote && recentMarket?.quote)
  const nextLinks = [
    view.focus?.id ? { href: `#game/${encodeURIComponent(view.focus.id)}`, label: view.focus.name || 'Their game' } : null,
    view.focus?.opponentAbbr && view.focus.opponentAbbr !== '—' ? { href: `#team/${encodeURIComponent(view.focus.opponentAbbr)}`, label: view.focus.opponentName } : null,
    { href: '#board', label: 'Scoreboard' },
    { href: '#news', label: 'News' },
  ].filter((link): link is { href: string; label: string } => Boolean(link))

  return (
    <div className="screen">
      <a className="back" href="#board">Scoreboard</a>
      <header className="panel team-hero">
        <div className="team-id">
          {view.logo ? <img src={view.logo} alt="" width={72} height={72} /> : <span className="logo-fallback lg">{view.abbr.slice(0, 1)}</span>}
          <div>
            <p className="kicker">{view.location || 'NFL'}</p>
            <h2>{view.name}</h2>
            <p>{view.record ? view.record : 'Record not listed'}</p>
            <p className="where">
              {view.homeRecord || view.roadRecord
                ? `${view.homeRecord ?? '—'} at home · ${view.roadRecord ?? '—'} on the road`
                : 'Home and road records were not on this pull.'}
            </p>
            {view.pointsFor != null || view.pointsAgainst != null ? (
              <p className="where">{fmt(view.pointsFor)} points scored · {fmt(view.pointsAgainst)} allowed</p>
            ) : null}
          </div>
        </div>
      </header>

      {view.highlights.length > 0 && (
        <div className="highlights">
          {view.highlights.map((item) => (
            <article key={item.label} className="highlight">
              <b>{item.label}</b>
              <span>{item.text}</span>
            </article>
          ))}
        </div>
      )}

      {view.focus ? (
        <MarketCard
          title={view.focus.state === 'post' ? 'Last game' : 'Next game'}
          game={focusMarket}
          teamGame={view.focus}
        />
      ) : (
        <section className="panel">
          <h2>Next game</h2>
          <p className="empty">No next or last game was on the schedule.</p>
          <a href="#board">Scoreboard</a>
        </section>
      )}

      {showRecentPrice && view.lastFinal && (
        <MarketCard title="Closing price from the last game" game={recentMarket} teamGame={view.lastFinal} />
      )}

      <section className="panel">
        <h2>Offense and defense</h2>
        {view.offense.length === 0 && view.defense.length === 0 ? (
          <p className="empty">
            Offense and defense splits were not on this pull.{' '}
            {view.focus ? <a href={`#game/${encodeURIComponent(view.focus.id)}`}>Their game</a> : <a href="#stats">Stats</a>}
            {' still opens.'}
          </p>
        ) : (
          <div className="statgrid">
            <div className="statblock">
              <h3>Offense</h3>
              {view.offense.length === 0 ? <p className="empty">No offense splits on this pull.</p> : (
                <dl>
                  {view.offense.map((row) => (
                    <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                  ))}
                </dl>
              )}
            </div>
            <div className="statblock">
              <h3>Defense</h3>
              {view.defense.length === 0 ? <p className="empty">No defense splits on this pull.</p> : (
                <dl>
                  {view.defense.map((row) => (
                    <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Top players</h2>
        {view.leaders.length === 0 ? (
          <p className="empty">
            Passing, rushing, and receiving leaders were not on this pull.{' '}
            {view.focus ? <a href={`#game/${encodeURIComponent(view.focus.id)}`}>The game page</a> : <a href="#stats">Stats</a>}
            {' is the next place to look.'}
          </p>
        ) : (
          <ul className="leaders">
            {view.leaders.map((leader) => (
              <li key={leader.label}>
                <small>{leader.label}</small>
                <b>{leader.name}</b>
                <span>{leader.stat}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>News</h2>
        {view.headlines.length === 0 ? (
          <p className="empty">No headlines for {view.name} on this pull. <a href="#news">League news</a> is the next stop.</p>
        ) : (
          <ul className="headlines">
            {view.headlines.map((item) => (
              <li key={item.id} className="hcard">
                <h3>{item.title}</h3>
                {item.blurb ? <p>{item.blurb}</p> : null}
                <span className="hlinks">
                  {item.href ? <a href={item.href} target="_blank" rel="noreferrer">Read on ESPN</a> : <span className="where">No story link on this headline.</span>}
                  <a href="#news">All news</a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Schedule</h2>
        {view.games.length === 0 ? (
          <p className="empty">The schedule was not on this pull. <a href="#board">Scoreboard</a></p>
        ) : (
          <ol className="schedule">
            {view.games.map((game) => (
              <li key={game.id || game.weekLabel} className="sched">
                <span>{game.weekLabel}</span>
                <a href={game.id ? `#game/${encodeURIComponent(game.id)}` : '#board'}>
                  <b>{game.result ?? (game.state === 'pre' ? game.detail : game.state === 'in' ? 'Live' : 'Final')}</b>
                  <small>
                    {game.scoreFor != null && game.scoreAgainst != null
                      ? `${view.abbr} ${game.scoreFor}, ${game.opponentAbbr} ${game.scoreAgainst}`
                      : game.name || 'Game'}
                  </small>
                </a>
                <a href={game.opponentAbbr !== '—' ? `#team/${encodeURIComponent(game.opponentAbbr)}` : '#board'}>
                  {game.home ? 'vs' : 'at'} {game.opponentAbbr}
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
      <NextStop links={nextLinks} />
    </div>
  )
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [choice, setChoice] = useState<WeekChoice>(readChoice)
  const [currentLoad, setCurrentLoad] = useState<Load>({ kind: 'loading' })
  const [previousLoad, setPreviousLoad] = useState<Load | null>(null)
  const [prevTry, setPrevTry] = useState(0)
  const [bundles, setBundles] = useState<Record<string, Bundle | 'error'>>({})
  const [quotes, setQuotes] = useState<Record<string, GameQuote>>({})
  const [quoteDone, setQuoteDone] = useState<Record<string, true>>({})
  const [offslate, setOffslate] = useState<Record<string, Extra>>({})
  const quoteTried = useRef(new Set<string>())

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancel = false
    fetchSlate()
      .then((slate) => {
        if (!cancel) setCurrentLoad({ kind: 'ready', slate })
      })
      .catch((err: unknown) => {
        if (!cancel) setCurrentLoad({ kind: 'error', message: messageOf(err, 'Scoreboard failed') })
      })
    return () => {
      cancel = true
    }
  }, [])

  const currentWeek = currentLoad.kind === 'ready' ? currentLoad.slate.board.week : 0
  const season = currentLoad.kind === 'ready' ? currentLoad.slate.board.season : 0
  const canPrev = currentWeek > 1

  useEffect(() => {
    if (choice !== 'previous' || currentLoad.kind !== 'ready' || !canPrev) return
    let cancel = false
    setPreviousLoad({ kind: 'loading' })
    fetchSlate(currentWeek - 1, season || null)
      .then((slate) => {
        if (!cancel) setPreviousLoad({ kind: 'ready', slate })
      })
      .catch((err: unknown) => {
        if (!cancel) setPreviousLoad({ kind: 'error', message: messageOf(err, 'Previous week failed') })
      })
    return () => {
      cancel = true
    }
  }, [choice, currentLoad.kind, canPrev, currentWeek, season, prevTry])

  const active: Load = choice === 'previous' && canPrev ? (previousLoad ?? { kind: 'loading' }) : currentLoad
  const board = active.kind === 'ready' ? active.slate.board : null

  useEffect(() => {
    if (!board) return
    let cancel = false
    for (const game of board.games) {
      if (game.quote || quoteTried.current.has(game.id)) continue
      quoteTried.current.add(game.id)
      fetchSummaryRaw(game.id)
        .then((raw) => {
          if (cancel) return
          const quote = quoteFromSummary(raw)
          if (quote) setQuotes((prev) => (prev[game.id] ? prev : { ...prev, [game.id]: quote }))
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancel) setQuoteDone((prev) => (prev[game.id] ? prev : { ...prev, [game.id]: true }))
        })
    }
    return () => {
      cancel = true
    }
  }, [board])

  const known = useMemo(() => {
    const map = new Map<string, BoardGame>()
    const add = (load: Load | null) => {
      if (!load || load.kind !== 'ready') return
      for (const game of load.slate.board.games) map.set(game.id, withQuote(game, quotes))
    }
    add(currentLoad)
    add(previousLoad)
    for (const [id, extra] of Object.entries(offslate)) {
      if (extra === 'error' || extra === 'loading') continue
      const next = withQuote(extra, quotes)
      const have = map.get(id)
      if (!have || (!have.quote && next.quote)) map.set(id, next)
    }
    return map
  }, [currentLoad, previousLoad, quotes, offslate])

  const rememberGame = useCallback((game: BoardGame) => {
    setOffslate((prev) => {
      const current = prev[game.id]
      if (current && current !== 'error' && current !== 'loading' && (current.quote || !game.quote)) return prev
      return { ...prev, [game.id]: game }
    })
    if (game.quote) setQuotes((prev) => (prev[game.id] ? prev : { ...prev, [game.id]: game.quote as GameQuote }))
  }, [])

  useEffect(() => {
    if (!board) return
    const wanted = route.screen === 'game' && route.id
      ? board.games.filter((game) => game.id === route.id)
      : route.screen === 'news' || route.screen === 'stats'
        ? board.games
        : []
    let cancel = false
    for (const game of wanted) {
      fetchSummaryRaw(game.id)
        .then((raw) => {
          if (cancel) return
          setBundles((prev) => ({ ...prev, [game.id]: bundleOf(raw, game) }))
        })
        .catch(() => {
          if (cancel) return
          setBundles((prev) => ({ ...prev, [game.id]: 'error' }))
        })
    }
    return () => {
      cancel = true
    }
  }, [board, route.screen, route.id])

  useEffect(() => {
    if (route.screen !== 'game' || !route.id) return
    const id = route.id
    let cancel = false
    fetchSummaryRaw(id)
      .then((raw) => {
        if (cancel) return
        const built = gameFromSummary(raw)
        if (built) {
          setOffslate((prev) => {
            const current = prev[id]
            if (current && current !== 'error' && current !== 'loading' && (current.quote || !built.quote)) return prev
            return { ...prev, [id]: built }
          })
          setBundles((prev) => ({ ...prev, [id]: bundleOf(raw, built) }))
        } else {
          setOffslate((prev) => (prev[id] && prev[id] !== 'loading' ? prev : { ...prev, [id]: 'error' }))
          setBundles((prev) => (prev[id] ? prev : { ...prev, [id]: 'error' }))
        }
      })
      .catch(() => {
        if (cancel) return
        setOffslate((prev) => (prev[id] && prev[id] !== 'loading' ? prev : { ...prev, [id]: 'error' }))
        setBundles((prev) => (prev[id] ? prev : { ...prev, [id]: 'error' }))
      })
    return () => {
      cancel = true
    }
  }, [route.screen, route.id])

  useEffect(() => {
    const game = route.id ? known.get(route.id) : undefined
    if (route.screen === 'game' && game) document.title = `${game.name} · Fieldglass`
    else if (route.screen === 'team' && route.id) document.title = `${route.id} · Fieldglass`
    else if (route.screen === 'news') document.title = 'News · Fieldglass'
    else if (route.screen === 'stats') document.title = 'Stats · Fieldglass'
    else document.title = 'Fieldglass'
  }, [known, route])

  const shownBoard = board ? { ...board, games: board.games.map((game) => withQuote(game, quotes)) } : null
  const spreadsLoading = Boolean(shownBoard?.games.some((game) => !game.quote && !quoteDone[game.id]))
  const wantedIds = board
    ? route.screen === 'game' && route.id
      ? [route.id]
      : route.screen === 'news' || route.screen === 'stats'
        ? board.games.map((game) => game.id)
        : []
    : []
  const pending = wantedIds.some((id) => bundles[id] === undefined)
  const game = route.screen === 'game' && route.id ? known.get(route.id) ?? null : null
  const navOn = route.screen === 'news' || route.screen === 'stats' ? route.screen : route.screen === 'board' ? 'board' : null
  const weekLabel = choice === 'previous' && canPrev
    ? `Week ${currentWeek - 1} · previous week`
    : currentWeek
      ? `Week ${currentWeek}${season ? ` · ${season}` : ''}`
      : 'This week in the NFL'

  function choose(next: WeekChoice) {
    setChoice(next)
    storeChoice(next)
    if (route.screen !== 'board' && route.screen !== 'news' && route.screen !== 'stats') {
      window.location.hash = 'board'
    }
  }

  let body: ReactNode
  if (route.screen === 'team' && route.id) {
    body = <TeamPage abbr={route.id} season={season || null} known={known} onGame={rememberGame} />
  } else if (route.screen === 'game') {
    if (game) body = <GameView game={game} bundle={bundles[game.id]} />
    else if (route.id && (offslate[route.id] === 'loading' || active.kind === 'loading')) {
      body = (
        <div className="screen">
          <a className="back" href="#board">Scoreboard</a>
          <p className="loading">Loading the game</p>
        </div>
      )
    } else {
      body = (
        <div className="screen">
          <a className="back" href="#board">Scoreboard</a>
          <div className="panel">
            <h2>Game not available</h2>
            <p>{active.kind === 'error' ? active.message : 'That game is not on the week you are viewing, and the detail did not load.'}</p>
          </div>
          <NextStop links={[{ href: '#board', label: 'Scoreboard' }, { href: '#news', label: 'News' }]} />
        </div>
      )
    }
  } else if (active.kind === 'loading') {
    body = <p className="loading">{choice === 'previous' && canPrev ? `Loading week ${currentWeek - 1}` : 'Loading the slate'}</p>
  } else if (active.kind === 'error') {
    body = (
      <div className="screen">
        <div className="panel">
          <h2>{choice === 'previous' ? `Week ${currentWeek - 1} didn't load` : 'Scoreboard unavailable'}</h2>
          <p>{active.message}</p>
          {choice === 'previous' ? (
            <button type="button" className="texty" onClick={() => setPrevTry((n) => n + 1)}>Try week {currentWeek - 1} again</button>
          ) : null}
        </div>
        <NextStop links={choice === 'previous' ? [{ href: '#board', label: 'Stay on this page and switch back above' }] : [{ href: '#news', label: 'News' }]} />
      </div>
    )
  } else if (route.screen === 'news') {
    body = <News slateHeadlines={active.slate.headlines} bundles={bundles} pending={pending} />
  } else if (route.screen === 'stats') {
    body = <Figures board={shownBoard ?? active.slate.board} bundles={bundles} pending={pending} />
  } else {
    body = <Scoreboard board={shownBoard ?? active.slate.board} spreadsLoading={spreadsLoading} />
  }

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
      </div>
      <header className="masthead">
        <div className="brand">
          <a className="brandlink" href="#board"><h1>Fieldglass</h1></a>
          <p className="sub">{weekLabel}</p>
        </div>
        {currentWeek > 0 && (
          <div className="week-switch" role="group" aria-label="Week">
            {canPrev && (
              <button type="button" className={choice === 'previous' ? 'on' : ''} aria-pressed={choice === 'previous'} onClick={() => choose('previous')}>
                Week {currentWeek - 1}
              </button>
            )}
            <button type="button" className={choice === 'current' || !canPrev ? 'on' : ''} aria-pressed={choice === 'current' || !canPrev} onClick={() => choose('current')}>
              Week {currentWeek} · This week
            </button>
          </div>
        )}
      </header>
      <nav className="nav" aria-label="Sections">
        {NAV.map((item) => (
          <a key={item.id} href={`#${item.id}`} className={navOn === item.id ? 'on' : ''} aria-current={navOn === item.id ? 'page' : undefined}>
            {item.label}
          </a>
        ))}
      </nav>
      <main className="main" id="main">{body}</main>
      <footer className="foot">
        Scores, play-by-play, team stats, and headlines come from ESPN's public feed. Spread, total, and moneyline are a market price. Fieldglass does not place a bet or recommend a side.
      </footer>
    </div>
  )
}
