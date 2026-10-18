import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchGameContext, fetchScoreboard } from '../board/load'
import { useOptionalEngine } from '../dataContext'
import { EmptyState, GlassCard, MatchupCard, ShortcutChip, Skeleton, StatGroup } from '../components/glass'
import { PlayerLink, TeamLink } from '../components/links'
import {
  filterGames,
  formatAmerican,
  formatLine,
  groupByWindow,
  matchGame,
  median,
  moveChips,
  movementSentences,
  priceSentence,
  scriptNote,
  sortGames,
  type Board,
  type BoardFilter,
  type BoardGame,
  type BoardSort,
  type GameContext,
  type TeamContext,
} from '../board/normalize'

const FILTERS: { id: BoardFilter; label: string }[] = [
  { id: 'pre', label: 'Upcoming' },
  { id: 'in', label: 'Live' },
  { id: 'post', label: 'Final' },
  { id: 'all', label: 'All' },
]

const SORTS: { id: BoardSort; label: string }[] = [
  { id: 'kickoff', label: 'Kickoff' },
  { id: 'total', label: 'Highest total' },
  { id: 'spread', label: 'Biggest spread' },
]

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown time'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function KnownName({ name }: { name: string }) {
  const players = useOptionalEngine()?.d.players ?? []
  const hit = players.find((p) => p.name.toLowerCase() === name.toLowerCase())
  if (!hit) return <b>{name}</b>
  return <PlayerLink id={hit.id} name={hit.name} />
}

function TeamLine({ side, line, price, showScore }: { side: BoardGame['home']; line: number | null; price: number | null; showScore: boolean }) {
  return (
    <div className="gteam">
      <span className="gswatch" style={{ background: side.color }} aria-hidden />
      {side.logo ? <img src={side.logo} alt="" width={28} height={28} /> : <span className="glogo-fallback">{side.abbr.slice(0, 1)}</span>}
      <span className="gname">
        <TeamLink abbr={side.abbr} />
        <small>{side.name}{side.record ? ` · ${side.record}` : ''}</small>
      </span>
      {showScore ? <b className="gscore">{side.score ?? '—'}</b> : (
        <span className="gline">
          <b>{formatLine(line)}</b>
          <small>{formatAmerican(price)}</small>
        </span>
      )}
    </div>
  )
}

function MarketCol({ title, primary, price, extra }: { title: string; primary: string; price: string; extra: string }) {
  return (
    <div className="mcol">
      <small>{title}</small>
      <b>{primary}</b>
      <span>{price}</span>
      <em>{extra}</em>
    </div>
  )
}

function TeamReport({ team }: { team: TeamContext }) {
  return (
    <section>
      <h3><TeamLink abbr={team.abbr} /></h3>
      {team.gapNote ? <p>{team.gapNote}</p> : <p className="muted">No recent scores on this pull.</p>}
      {team.recent.length > 0 && (
        <ol className="recent">
          {team.recent.map((g, i) => (
            <li key={`${g.week}-${i}`}>
              <b className={g.result === 'W' ? 'up' : g.result === 'L' ? 'down' : undefined}>{g.result || '—'}</b>
              <span>{g.pointsFor ?? '—'}-{g.pointsAgainst ?? '—'}</span>
              <small>{g.atVs} {g.opponent}{g.week ? ` · Wk ${g.week}` : ''}</small>
            </li>
          ))}
        </ol>
      )}
      {team.injuries.length > 0 && (
        <ul className="inj-list">
          {team.injuries.map((inj) => (
            <li key={`${inj.name}-${inj.status}`}>
              <span className={`inj inj-${inj.status === 'Out' ? 'OUT' : inj.status === 'Doubtful' ? 'DOUBTFUL' : 'QUESTIONABLE'}`}>{inj.status}</span>
              <KnownName name={inj.name} />
              <small>{inj.pos}{inj.detail ? ` · ${inj.detail}` : ''}</small>
            </li>
          ))}
        </ul>
      )}
      {team.irCount > 0 && <p className="muted">{team.irCount} more on injured reserve, not listed for this week.</p>}
    </section>
  )
}

export function GameDetail({ game, ctx }: { game: BoardGame; ctx: GameContext | 'loading' | 'error' | undefined }) {
  const q = game.quote
  const sentences = movementSentences(game)
  const script = scriptNote(game)
  return (
    <div className="gdetail">
      <p className="gwhere">
        {[game.venue, game.city, game.indoor === true ? 'Indoor' : game.indoor === false ? 'Outdoor' : null, game.broadcast, game.neutral ? 'Neutral site' : null, game.note]
          .filter(Boolean)
          .join(' · ') || 'Venue not on this pull'}
      </p>
      {q ? (
        <div className="detail-grid">
          <MarketCol
            title={`${q.book} spread`}
            primary={`${game.home.abbr} ${formatLine(q.home.line)}`}
            price={q.home.price != null ? `${formatAmerican(q.home.price)} · ${priceSentence(q.home.price)}` : 'Price not listed'}
            extra={q.home.openLine != null ? `Opened ${formatLine(q.home.openLine)}` : 'No open number'}
          />
          <MarketCol
            title="Total"
            primary={q.total != null ? String(q.total) : '—'}
            price={[q.overPrice != null ? `Over ${formatAmerican(q.overPrice)}` : null, q.underPrice != null ? `Under ${formatAmerican(q.underPrice)}` : null].filter(Boolean).join(' · ') || 'Price not listed'}
            extra={q.openTotal != null ? `Opened ${q.openTotal}` : 'No open number'}
          />
          <MarketCol
            title="Moneyline"
            primary={`${game.away.abbr} ${formatAmerican(q.away.moneyline)}`}
            price={`${game.home.abbr} ${formatAmerican(q.home.moneyline)}`}
            extra={q.home.openMoneyline != null ? `Home opened ${formatAmerican(q.home.openMoneyline)}` : 'No open number'}
          />
        </div>
      ) : (
        <p>No line on this game. The final score is the result. A missing quote is not a number to invent.</p>
      )}
      {game.implied && (
        <>
          <StatGroup
            label="Implied totals"
            items={[
              { label: game.away.abbr, value: String(game.implied.away) },
              { label: game.home.abbr, value: String(game.implied.home), className: 'hero' },
            ]}
          />
          <p className="muted small">Implied total is (total ± spread) / 2. The favorite's number is higher. It is how many points the market has each team scoring, which is the environment of the game.</p>
        </>
      )}
      {sentences.map((s) => <p key={s}>{s}</p>)}
      {script && <p>{script}</p>}
      <p className="muted">The price next to a line is what that side costs. A move from the open is the market changing its mind. Neither one is a side to take.</p>
      {game.leaders.length > 0 && (
        <p className="leaders">
          Season leaders:{' '}
          {game.leaders.map((l, i) => (
            <span key={`${l.name}-${l.stat}`}>{i > 0 ? ' · ' : ''}<KnownName name={l.name} /> {l.stat}</span>
          ))}
        </p>
      )}
      {ctx === 'loading' && <Skeleton variant="rows" label="Injury report and last five" />}
      {ctx === 'error' && <p>Injury report and recent scores did not load. The line above is still the scoreboard quote.</p>}
      {ctx && ctx !== 'loading' && ctx !== 'error' && (
        <>
          {ctx.predictor && (
            <p>ESPN's matchup predictor has <TeamLink abbr={game.home.abbr} /> at {ctx.predictor.home}% and <TeamLink abbr={game.away.abbr} /> at {ctx.predictor.away}%. That is ESPN's model, separate from the market price.</p>
          )}
          <div className="team-reports">
            <TeamReport team={ctx.away} />
            <TeamReport team={ctx.home} />
          </div>
        </>
      )}
    </div>
  )
}

function Card({ game, open, ctx, onToggle }: { game: BoardGame; open: boolean; ctx: GameContext | 'loading' | 'error' | undefined; onToggle: () => void }) {
  const q = game.quote
  const showScore = game.state !== 'pre'
  const chips = moveChips(game)
  return (
    <MatchupCard open={open}>
      <div className="gcard-hit">
        <div className="gteams">
          <TeamLine side={game.away} line={q?.away.line ?? null} price={q?.away.price ?? null} showScore={showScore} />
          <TeamLine side={game.home} line={q?.home.line ?? null} price={q?.home.price ?? null} showScore={showScore} />
        </div>
        <div className="gmeta">
          <span className="gstate">{game.detail}</span>
          <span className="gtotal">{q?.total != null ? `O/U ${q.total}` : 'No line'}</span>
          {game.implied && <span className="gimpl">{game.away.abbr} {game.implied.away} · {game.home.abbr} {game.implied.home}</span>}
          {chips.length > 0 && (
            <span className="gchips">{chips.map((c) => <em key={c}>{c}</em>)}</span>
          )}
          <a className="dest" href={`#game/${encodeURIComponent(game.id)}`}>Open game</a>
        </div>
      </div>
      <button type="button" className="gexpand" aria-expanded={open} onClick={onToggle}>
        {open ? 'Hide the line' : 'Line, injuries, last five'}
      </button>
      {open && <GameDetail game={game} ctx={ctx} />}
    </MatchupCard>
  )
}

export function Board() {
  const [board, setBoard] = useState<Board | null>(null)
  const [source, setSource] = useState<'live' | 'snapshot' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<BoardFilter>('pre')
  const [sort, setSort] = useState<BoardSort>('kickoff')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [ctx, setCtx] = useState<Record<string, GameContext | 'loading' | 'error'>>({})
  const [refreshing, setRefreshing] = useState(false)
  const userChose = useRef(false)

  useEffect(() => {
    let stop = false
    const pull = (first: boolean) => {
      fetchScoreboard()
        .then(({ board: next, source: src }) => {
          if (stop) return
          setBoard(next)
          setSource(src)
          setError(null)
          if (first && !userChose.current) {
            const live = next.games.some((g) => g.state === 'in')
            const upcoming = next.games.some((g) => g.state === 'pre')
            setFilter(live ? 'in' : upcoming ? 'pre' : 'all')
          }
        })
        .catch((e: Error) => {
          if (stop) return
          if (first) setError(e.message)
        })
    }
    pull(true)
    const id = window.setInterval(() => pull(false), 60_000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      e.preventDefault()
      document.getElementById('board-find')?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const refresh = () => {
    setRefreshing(true)
    fetchScoreboard()
      .then(({ board: next, source: src }) => {
        setBoard(next)
        setSource(src)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setRefreshing(false))
  }

  useEffect(() => {
    if (!openId || !board) return
    const game = board.games.find((g) => g.id === openId)
    if (!game || ctx[openId]) return
    setCtx((cur) => ({ ...cur, [openId]: 'loading' }))
    fetchGameContext(game)
      .then((detail) => setCtx((cur) => ({ ...cur, [openId]: detail })))
      .catch(() => setCtx((cur) => ({ ...cur, [openId]: 'error' })))
  }, [openId, board, ctx])

  const visible = useMemo(() => {
    if (!board) return []
    return sortGames(filterGames(board.games, filter).filter((g) => matchGame(g, query)), sort)
  }, [board, filter, query, sort])

  const counts = useMemo(() => {
    const games = board?.games ?? []
    return {
      pre: games.filter((g) => g.state === 'pre').length,
      in: games.filter((g) => g.state === 'in').length,
      post: games.filter((g) => g.state === 'post').length,
      all: games.length,
    }
  }, [board])

  const slate = useMemo(() => {
    const pool = (board?.games ?? []).filter((g) => g.state !== 'post' && g.quote?.total != null)
    const totals = pool.map((g) => g.quote!.total!)
    const byTotal = [...pool].sort((a, b) => (b.quote?.total ?? 0) - (a.quote?.total ?? 0))
    const bySpread = [...pool].sort((a, b) => Math.abs(b.quote?.homeSpread ?? 0) - Math.abs(a.quote?.homeSpread ?? 0))
    return { median: median(totals), high: byTotal[0] ?? null, wide: bySpread[0] ?? null }
  }, [board])

  const groups = sort === 'kickoff' && !query.trim() ? groupByWindow(visible) : [{ label: SORTS.find((s) => s.id === sort)!.label, games: visible }]

  const openGame = (id: string) => {
    userChose.current = true
    setOpenId((cur) => (cur === id ? null : id))
    const game = board?.games.find((g) => g.id === id)
    if (game && filter !== 'all' && game.state !== filter) setFilter('all')
  }

  if (error && !board) {
    return (
      <section className="screen">
        <EmptyState title="The board didn't answer" body={error}>
          <p className="news-next"><a className="dest" href="#team">Back to the desk</a></p>
        </EmptyState>
      </section>
    )
  }
  if (!board) {
    return (
      <section className="screen">
        <Skeleton variant="rows" label="Loading the week" />
      </section>
    )
  }

  return (
    <section className="screen board">
      <GlassCard featured lean className="board-head">
        <div>
          <h2>Week {board.week || '—'}{board.season ? ` · ${board.season}` : ''}</h2>
          <p className="muted">
            {source === 'live' ? 'Live scoreboard' : 'Saved scoreboard, ESPN did not answer'} · {when(board.fetchedAt)}
            {board.byes.length > 0 ? <span className="bye-line"> · Bye: {board.byes.map((b, i) => <span key={b.abbr}>{i ? ', ' : ''}<TeamLink abbr={b.abbr}>{b.abbr}</TeamLink></span>)}</span> : null}
          </p>
          {error && <p>{error}</p>}
        </div>
        <button type="button" className="ghost magnetic" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </GlassCard>

      <div className="slate-stats">
        <div><small>Upcoming</small><b>{counts.pre}</b></div>
        <div><small>Median total</small><b>{slate.median ?? '—'}</b></div>
        {slate.high ? (
          <a className="slate-jump" href={`#game/${encodeURIComponent(slate.high.id)}`}>
            <small>Highest total</small>
            <b>{slate.high.quote?.total ?? '—'}</b>
            <em>{slate.high.away.abbr} @ {slate.high.home.abbr}</em>
          </a>
        ) : (
          <div><small>Highest total</small><b>—</b></div>
        )}
        {slate.wide ? (
          <a className="slate-jump" href={`#game/${encodeURIComponent(slate.wide.id)}`}>
            <small>Biggest spread</small>
            <b>{slate.wide.quote?.homeSpread != null ? Math.abs(slate.wide.quote.homeSpread).toFixed(1) : '—'}</b>
            <em>{slate.wide.away.abbr} @ {slate.wide.home.abbr}</em>
          </a>
        ) : (
          <div><small>Biggest spread</small><b>—</b></div>
        )}
      </div>

      <div className="board-tools">
        <div className="seg" role="group" aria-label="Which games">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'on' : ''} aria-pressed={filter === f.id} onClick={() => { userChose.current = true; setFilter(f.id) }}>
              {f.label} <span className="count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <label className="sortbox">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as BoardSort)} aria-label="Sort games">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="findbox">
          <span className="sr">Find a team</span>
          <ShortcutChip keys="/" />
          <input id="board-find" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a team" aria-label="Find a team" />
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={query.trim() ? 'No match on the board' : 'Nothing in this window'}
          body={query.trim() ? `No game matches “${query.trim()}”. Try another club or clear the search.` : 'This group is empty. Switch to All, or check back closer to kickoff.'}
        >
          <p className="news-next">
            <button type="button" className="primary" onClick={() => { userChose.current = true; setQuery(''); setFilter('all') }}>Show every game</button>
            <a className="dest" href="#news">News</a>
          </p>
        </EmptyState>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="window">
            <h3>{group.label}</h3>
            <div className="board-grid">
              {group.games.map((game) => (
                <Card key={game.id} game={game} open={openId === game.id} ctx={ctx[game.id]} onToggle={() => openGame(game.id)} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
