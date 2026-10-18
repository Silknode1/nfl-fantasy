import { useEffect, useState, type ReactNode } from 'react'
import { formatLine, groupByWindow, type Board, type BoardGame, type GameContext } from './board/normalize'
import { fetchSlate, fetchSummaryRaw, summaryContext, type Slate } from './load'
import {
  dedupeHeadlines,
  drivesFrom,
  headlinesFromSummary,
  keyTeamStats,
  leadersFromSummary,
  seasonLinesFrom,
  type Drive,
  type Headline,
  type LeaderLine,
  type SeasonLine,
  type TeamStatBlock,
} from './story'

type Screen = 'board' | 'news' | 'stats' | 'game'

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

const NAV = [
  { id: 'board', label: 'Scoreboard' },
  { id: 'news', label: 'News' },
  { id: 'stats', label: 'Stats' },
] as const

function readRoute(): Route {
  const h = window.location.hash.replace(/^#/, '')
  if (h === 'news') return { screen: 'news' }
  if (h === 'stats') return { screen: 'stats' }
  if (h.startsWith('game/')) {
    const id = decodeURIComponent(h.slice('game/'.length))
    if (id) return { screen: 'game', id }
  }
  return { screen: 'board' }
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

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Time not listed'
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function quarter(n: number | null): string {
  if (n == null) return ''
  if (n >= 1 && n <= 4) return `Q${n}`
  if (n === 5) return 'OT'
  return `OT${n - 4}`
}

function spreadText(game: BoardGame): string {
  const q = game.quote
  if (!q || q.homeSpread == null) return 'Spread not listed'
  if (q.homeSpread < 0) return `${game.home.abbr} ${formatLine(q.home.line)}`
  if (q.homeSpread > 0) return `${game.away.abbr} ${formatLine(q.away.line)}`
  return 'Even spread'
}

function totalText(game: BoardGame): string {
  return game.quote?.total == null ? 'Total not listed' : `Total ${game.quote.total}`
}

function fmt(n: number | null): string {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function wins(record: string): number {
  const n = Number(record.split('-')[0])
  return Number.isFinite(n) ? n : -1
}

function Mark({ side }: { side: BoardGame['home'] }) {
  return side.logo ? <img src={side.logo} alt="" width={36} height={36} /> : <span className="logo-fallback">{side.abbr.slice(0, 1)}</span>
}

function TeamLine({ side, score }: { side: BoardGame['home']; score: boolean }) {
  return (
    <div className="gteam">
      <span className="gswatch" style={{ background: side.color }} aria-hidden />
      <Mark side={side} />
      <span className="gname">
        <b>{side.abbr}</b>
        <small>{side.name}{side.record ? ` · ${side.record}` : ''}</small>
      </span>
      {score ? <b className="gscore">{side.score ?? '—'}</b> : null}
    </div>
  )
}

function Scoreboard({ board }: { board: Board }) {
  if (!board.games.length) return <p className="empty">No games on this week's scoreboard.</p>
  const groups = groupByWindow(board.games)
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>Scoreboard</h2>
        <p>Spread and total are a market price. Fieldglass does not recommend a side.</p>
      </div>
      {groups.map((group) => (
        <section key={group.label} className="window">
          <h3>{group.label}</h3>
          <div className="cards">
            {group.games.map((game) => (
              <a key={game.id} className="gcard" href={`#game/${encodeURIComponent(game.id)}`}>
                <span className="sr">{game.name}</span>
                <div className="gteams">
                  <TeamLine side={game.away} score={game.state !== 'pre'} />
                  <TeamLine side={game.home} score={game.state !== 'pre'} />
                </div>
                <div className="gmeta">
                  <b>{game.state === 'pre' ? when(game.kickoff) : game.detail}</b>
                  <span>{spreadText(game)}</span>
                  <span>{totalText(game)}</span>
                  {game.note ? <small>{game.note}</small> : null}
                </div>
              </a>
            ))}
          </div>
        </section>
      ))}
      {board.byes.length > 0 && <p className="byes">Bye: {board.byes.map((t) => t.abbr).join(', ')}</p>}
    </div>
  )
}

function DriveList({ drives, game }: { drives: Drive[]; game: BoardGame }) {
  return (
    <ol className="drives">
      {drives.map((drive) => (
        <li key={drive.id} className="drive">
          <header>
            <b>{drive.team}</b>
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
      ))}
    </ol>
  )
}

function GameView({ game, bundle }: { game: BoardGame; bundle: Bundle | 'error' | undefined }) {
  const started = game.state !== 'pre'
  const loaded = bundle && bundle !== 'error' ? bundle : null
  const where = [game.venue, game.city, game.broadcast, game.neutral ? 'Neutral site' : null].filter(Boolean).join(' · ')
  const headlines = loaded?.headlines ?? []
  const leaders = loaded && loaded.leaders.length ? loaded.leaders : game.leaders.map((l) => ({ label: l.label, name: l.name, value: l.stat, team: '' }))
  const sides = loaded ? [loaded.context.away, loaded.context.home] : []
  const hasFigures = Boolean(loaded && (loaded.stats.length || leaders.length || sides.some((s) => s.recent.length)))
  return (
    <div className="screen">
      <a className="back" href="#board">Scoreboard</a>
      <header className="panel match">
        <p className="kicker">{game.detail}</p>
        <TeamLine side={game.away} score={started} />
        <TeamLine side={game.home} score={started} />
        <p className="market">{spreadText(game)} · {totalText(game)}</p>
        {where ? <p className="where">{where}</p> : null}
      </header>

      <section className="panel">
        <h2>Play by play</h2>
        {bundle === undefined && <p className="loading">Loading the game</p>}
        {bundle === 'error' && <p className="empty">This game's detail didn't load. The score is still on the scoreboard.</p>}
        {loaded && loaded.drives.length === 0 && (
          <p className="empty">
            {started
              ? 'Play-by-play is not on this pull.'
              : `This game has not started. Kickoff is ${when(game.kickoff)}.`}
          </p>
        )}
        {loaded && loaded.drives.length > 0 && <DriveList drives={loaded.drives} game={game} />}
      </section>

      <section className="panel">
        <h2>Team figures</h2>
        {bundle === undefined && <p className="loading">Loading figures</p>}
        {bundle === 'error' && <p className="empty">Team figures didn't load for this game.</p>}
        {loaded && !hasFigures && <p className="empty">No team figures on this pull.</p>}
        {loaded && loaded.stats.length > 0 && (
          <div className="statgrid">
            {loaded.stats.map((block) => (
              <div key={block.abbr} className="statblock">
                <h3>{block.abbr}</h3>
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
        {sides.some((s) => s.recent.length > 0) && (
          <ul className="fives">
            {sides.filter((s) => s.recent.length).map((s) => (
              <li key={s.abbr}>
                <b>{s.abbr}</b>
                <span>{s.recent.map((g) => g.result || '—').join(' ')}</span>
                <small>{s.avgPoints != null ? `${fmt(s.avgPoints)} pts over the last five` : 'Last five'}</small>
              </li>
            ))}
          </ul>
        )}
        {leaders.length > 0 && (
          <ul className="leaders">
            {leaders.map((l) => (
              <li key={`${l.label}-${l.name}`}>
                <small>{l.label}{l.team ? ` · ${l.team}` : ''}</small>
                <b>{l.name}</b>
                <span>{l.value}</span>
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
    </div>
  )
}

function HeadlineList({ items }: { items: Headline[] }) {
  return (
    <ul className="headlines">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="hcard">
          {item.kind === 'game' && item.gameName ? <small>{item.gameName}</small> : <small>League</small>}
          <h3>{item.title}</h3>
          {item.blurb ? <p>{item.blurb}</p> : null}
          {item.href ? <a href={item.href} target="_blank" rel="noreferrer">Read on ESPN</a> : null}
        </li>
      ))}
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
  const failed = !pending && Object.keys(bundles).length > 0 && Object.values(bundles).every((b) => b === 'error')
  return (
    <div className="screen">
      <div className="screen-head">
        <h2>News</h2>
        <p>Headlines gathered from this week's scoreboard and game summaries.</p>
      </div>
      {pending && items.length === 0 && <p className="loading">Gathering headlines</p>}
      {!pending && items.length === 0 && <p className="empty">{failed ? "Headlines didn't load." : 'No headlines on this slate yet.'}</p>}
      {items.length > 0 && <HeadlineList items={items} />}
      {pending && items.length > 0 && <p className="note">Still gathering the rest of the slate.</p>}
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
      row.five = side.recent.map((g) => g.result || '—').join(' ')
      row.avg = side.avgPoints
    }
  }
  return [...map.values()].sort((a, b) => wins(b.record) - wins(a.record) || a.name.localeCompare(b.name))
}

function leadSentence(rows: FigureRow[]): string {
  const byPoints = rows.filter((r) => r.points != null).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  if (byPoints.length) {
    const top = byPoints[0]
    return `${top.name} are scoring ${fmt(top.points)} points a game. The table is this week's slate, not a power ranking.`
  }
  const byFive = rows.filter((r) => r.avg != null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
  if (byFive.length) return `${byFive[0].name} has scored ${fmt(byFive[0].avg)} a game over the last five.`
  return 'Records from the scoreboard. Season rates fill in as each game summary arrives.'
}

function Figures({ board, bundles, pending }: { board: Board; bundles: Record<string, Bundle | 'error'>; pending: boolean }) {
  const rows = figureRows(board.games, bundles)
  const leaders = board.games.flatMap((g) => g.leaders)
  const seen = new Set<string>()
  const uniqueLeaders = leaders.filter((l) => {
    const key = `${l.label}|${l.name}`
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
                  <th>{row.abbr}<small>{row.name}</small></th>
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
        {!pending && rows.every((r) => r.points == null) && <p className="empty">Season scoring rates were not on this pull. Records are from the scoreboard.</p>}
        {uniqueLeaders.length > 0 && (
          <ul className="leaders">
            {uniqueLeaders.map((l) => (
              <li key={`${l.label}-${l.name}`}>
                <small>{l.label}</small>
                <b>{l.name}</b>
                <span>{l.stat}</span>
              </li>
            ))}
          </ul>
        )}
        {board.byes.length > 0 && <p className="byes">Bye: {board.byes.map((t) => `${t.name} (${t.abbr})`).join(', ')}</p>}
      </section>
    </div>
  )
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [bundles, setBundles] = useState<Record<string, Bundle | 'error'>>({})

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancel = false
    fetchSlate()
      .then((slate) => {
        if (!cancel) setLoad({ kind: 'ready', slate })
      })
      .catch((err: unknown) => {
        if (!cancel) setLoad({ kind: 'error', message: err instanceof Error ? err.message : 'Scoreboard failed' })
      })
    return () => {
      cancel = true
    }
  }, [])

  const board = load.kind === 'ready' ? load.slate.board : null

  useEffect(() => {
    if (!board) return
    const wanted = route.screen === 'game' && route.id
      ? board.games.filter((g) => g.id === route.id)
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
    const game = board?.games.find((g) => g.id === route.id)
    if (route.screen === 'game' && game) document.title = `${game.name} · Fieldglass`
    else if (route.screen === 'news') document.title = 'News · Fieldglass'
    else if (route.screen === 'stats') document.title = 'Stats · Fieldglass'
    else document.title = 'Fieldglass'
  }, [board, route])

  const navOn = route.screen === 'game' ? 'board' : route.screen
  const wantedIds = board
    ? route.screen === 'game' && route.id
      ? [route.id]
      : route.screen === 'news' || route.screen === 'stats'
        ? board.games.map((g) => g.id)
        : []
    : []
  const pending = wantedIds.some((id) => bundles[id] === undefined)
  const game = board?.games.find((g) => g.id === route.id)

  let body: ReactNode
  if (load.kind === 'loading') body = <p className="loading">Loading the slate</p>
  else if (load.kind === 'error') {
    body = (
      <div className="panel">
        <h2>Scoreboard unavailable</h2>
        <p>{load.message}</p>
      </div>
    )
  } else if (route.screen === 'news') {
    body = <News slateHeadlines={load.slate.headlines} bundles={bundles} pending={pending} />
  } else if (route.screen === 'stats') {
    body = <Figures board={load.slate.board} bundles={bundles} pending={pending} />
  } else if (route.screen === 'game') {
    body = game
      ? <GameView game={game} bundle={bundles[game.id]} />
      : (
        <div className="panel">
          <h2>Game not on this slate</h2>
          <p>That game is not in the current week's scoreboard.</p>
          <a className="back" href="#board">Scoreboard</a>
        </div>
      )
  } else body = <Scoreboard board={load.slate.board} />

  const week = board && board.week ? `Week ${board.week}${board.season ? ` · ${board.season}` : ''}` : 'This week in the NFL'

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
      </div>
      <header className="masthead">
        <div className="brand">
          <h1>Fieldglass</h1>
          <p className="sub">{week}</p>
        </div>
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
        Scores, play-by-play, and headlines come from ESPN's public feed. Spread and total are a market price. Fieldglass does not place a bet or recommend a side.
      </footer>
    </div>
  )
}
