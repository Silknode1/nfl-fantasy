import { useState } from 'react'
import {
  articleFacts,
  boxScorePoints,
  currentHomeWin,
  gameArticle,
  headlinesForRecent,
  headlinesFromSummary,
  marginSentence,
  moneylineText,
  playersInGame,
  possessionAbbr,
  ringSlots,
  scoringPlaysFrom,
  spreadText,
  standoutsFrom,
  summarySituation,
  watchTarget,
  winSeries,
  drivesFrom,
  type DeskPlayer,
} from '../board/desk'
import {
  formatAmerican,
  formatLine,
  movementSentences,
  priceSentence,
  scriptNote,
  type Board,
  type BoardGame,
  type GameContext,
  type RecentGame,
  type TeamContext,
} from '../board/normalize'
import { useOptionalEngine } from '../dataContext'
import { useOptionalFocus } from '../focus'
import { ClipStack } from './ClipStack'
import { PlayerLink, TeamLink } from './links'

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso || 'time not listed'
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function KnownName({ name }: { name: string }) {
  const players = useOptionalEngine()?.d.players ?? []
  const hit = players.find((p) => p.name.toLowerCase() === name.toLowerCase())
  if (!hit) return <b>{name}</b>
  return <PlayerLink id={hit.id} name={hit.name} />
}

function WatchIcon() {
  return (
    <svg className="watch-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M8 6.5v11l9-5.5-9-5.5z" fill="currentColor" />
      <rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function RingCard({ game, yours, onSelect }: { game: BoardGame; yours: boolean; onSelect: (id: string) => void }) {
  const showScore = game.state !== 'pre'
  const spread = game.quote?.home.line
  const ball = possessionAbbr(game)
  const clock = game.situation?.clock || game.detail
  return (
    <button type="button" className={yours ? 'ring-card has-roster' : 'ring-card'} onClick={() => onSelect(game.id)}>
      {yours && <i className="roster-mark" title="Someone on your roster is in this game" />}
      <span className="ring-teams">
        <b>{game.away.abbr}</b>
        {showScore ? <b className="ring-score">{game.away.score ?? '—'}–{game.home.score ?? '—'}</b> : <em>{game.detail}</em>}
        <b>{game.home.abbr}</b>
      </span>
      <span className="ring-meta">
        {clock}
        {ball ? ` · ${ball} ball` : ''}
        {game.situation?.redZone ? ' · Red zone' : ''}
        {spread == null ? ' · No line' : ` · ${game.home.abbr} ${formatLine(spread)}`}
      </span>
      <WatchIcon />
      <span className="sr">{yours ? 'Your roster is in this game. ' : ''}Show {game.away.name} at {game.home.name} in the center. {game.broadcast ?? 'No broadcast listed'}.</span>
    </button>
  )
}

function WinDots({ points }: { points: { home: number }[] }) {
  if (!points.length) return null
  const w = 360
  const h = 88
  const xy = points.map((point, i) => {
    const x = points.length === 1 ? w / 2 : (i / (points.length - 1)) * (w - 8) + 4
    const y = 6 + (1 - Math.max(0, Math.min(100, point.home)) / 100) * (h - 12)
    return { x, y }
  })
  return (
    <figure className="win-line">
      <figcaption>ESPN's model</figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`ESPN home win probability across ${points.length} recorded plays`}>
        {points.length >= 2 && <polyline points={xy.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />}
        {xy.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={points.length === 1 ? 6 : 3} />)}
      </svg>
    </figure>
  )
}

function MarketBlock({ game }: { game: BoardGame }) {
  const quote = game.quote
  const lines = moneylineText(game)
  if (!quote) return <p>No line on this game. The final score is the result. A missing quote is not a number to invent.</p>
  return (
    <div className="market-block">
      <h3>Market</h3>
      <div className="detail-grid">
        <div className="mcol">
          <small>{quote.book} spread</small>
          <b>{spreadText(game) ?? '—'}</b>
          <span>{quote.home.price != null ? `${formatAmerican(quote.home.price)} · ${priceSentence(quote.home.price)}` : 'Price not listed'}</span>
        </div>
        <div className="mcol">
          <small>Total</small>
          <b>{quote.total ?? '—'}</b>
          <span>{[quote.overPrice != null ? `Over ${formatAmerican(quote.overPrice)}` : null, quote.underPrice != null ? `Under ${formatAmerican(quote.underPrice)}` : null].filter(Boolean).join(' · ') || 'Price not listed'}</span>
        </div>
        <div className="mcol">
          <small>Moneyline</small>
          <b>{game.away.abbr} {lines.away ?? '—'}</b>
          <span>{game.home.abbr} {lines.home ?? '—'}</span>
        </div>
      </div>
      {movementSentences(game).map((sentence) => <p key={sentence}>{sentence}</p>)}
      {scriptNote(game) && <p>{scriptNote(game)}</p>}
      <p className="muted">The price next to a line is what that side costs. It is not a side to take.</p>
      {marginSentence(game) && <p>{marginSentence(game)}. That is the score minus the spread, not a forecast.</p>}
    </div>
  )
}

function InjuryList({ teams }: { teams: TeamContext[] }) {
  const rows = teams.flatMap((team) => team.injuries.map((inj) => ({ ...inj, team: team.name })))
  if (!rows.length) return <p className="muted">No out, doubtful, or questionable players on this pull.</p>
  return (
    <ul className="inj-list">
      {rows.map((inj) => (
        <li key={`${inj.team}-${inj.name}-${inj.status}`}>
          <span className={`inj inj-${inj.status === 'Out' ? 'OUT' : inj.status === 'Doubtful' ? 'DOUBTFUL' : 'QUESTIONABLE'}`}>{inj.status}</span>
          <KnownName name={inj.name} />
          <small>{inj.team}{inj.pos ? ` · ${inj.pos}` : ''}{inj.detail ? ` · ${inj.detail}` : ''}</small>
        </li>
      ))}
    </ul>
  )
}

function RecentStrip({ label, games, onOpen }: { label: string; games: RecentGame[]; onOpen: (game: RecentGame) => void }) {
  if (!games.length) return null
  return (
    <div className="recent-strip">
      <h3>{label}</h3>
      <ol>
        {games.map((game, i) => (
          <li key={`${game.id ?? game.week}-${i}`}>
            <button type="button" onClick={() => onOpen(game)}>
              <b className={game.result === 'W' ? 'up' : game.result === 'L' ? 'down' : undefined}>{game.result || '—'}</b>
              <span>Wk {game.week ?? '—'}</span>
              <small>{game.atVs} {game.opponent} {game.pointsFor ?? '—'}–{game.pointsAgainst ?? '—'}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function DeskFrame({
  board,
  source,
  lineError,
  selected,
  missingId,
  detail,
  detailError,
  onSelect,
}: {
  board: Board
  source: 'live' | 'snapshot'
  lineError: string | null
  selected: BoardGame | null
  missingId: string | null
  detail: { context: GameContext | null; raw: unknown } | null
  detailError: boolean
  onSelect: (id: string) => void
}) {
  const engine = useOptionalEngine()
  const focus = useOptionalFocus()
  const [recent, setRecent] = useState<RecentGame | null>(null)
  const myId = engine?.d.meta.myTeamId ?? -1
  const week = engine ? String(engine.d.meta.week) : ''
  const roster: DeskPlayer[] = engine
    ? engine.d.players
      .filter((p) => p.teamId === myId && p.status === 'ONTEAM')
      .map((p) => ({ id: p.id, name: p.name, nfl: p.nfl, teamId: p.teamId, proj: p.proj[week] ?? null }))
    : []
  const others = selected ? board.games.filter((game) => game.id !== selected.id) : board.games
  const slots = ringSlots(others)
  const dense = board.games.length > 8
  const solo = board.games.length <= 1
  const sided = slots.left.length > 0 || slots.right.length > 0
  const yours = (game: BoardGame) => playersInGame(game, roster, myId).length > 0
  const frameClass = solo ? 'frame solo' : `${dense ? 'frame dense' : 'frame'}${sided ? '' : ' no-sides'}`

  const ring = (games: BoardGame[], place: string) => (
    games.length > 0 ? (
      <div className={`ring ring-${place}`}>
        {games.map((game) => <RingCard key={game.id} game={game} yours={yours(game)} onSelect={onSelect} />)}
      </div>
    ) : null
  )

  return (
    <div className="desk-copy">
      <header className="board-head">
        <div>
          <h2>Week {board.week || '—'}{board.season ? ` · ${board.season}` : ''}</h2>
          <p className="muted">
            {source === 'live' ? 'Live scoreboard' : 'Saved scoreboard, ESPN did not answer'} · {when(board.fetchedAt)}
            {board.byes.length > 0 ? <span className="bye-line"> · Bye: {board.byes.map((b, i) => <span key={b.abbr}>{i ? ', ' : ''}<TeamLink abbr={b.abbr}>{b.abbr}</TeamLink></span>)}</span> : null}
          </p>
        </div>
      </header>
      <div className={frameClass}>
        {!solo && ring(slots.top, 'top')}
        {!solo && ring(slots.left, 'left')}
        <div className="center-desk glass featured">
          {lineError && <p className="block-fail">Line: {lineError}</p>}
          {missingId && !selected && (
            <p>That game is not on this week's board. The ring is still the scoreboard we have.</p>
          )}
          {selected && (
            <Center
              game={selected}
              detail={detail}
              detailError={detailError}
              roster={roster}
              myId={myId}
              onRecent={setRecent}
              onPinArticle={(paragraphs) => focus?.pin({
                kind: 'article',
                id: `article:${selected.id}`,
                gameId: selected.id,
                title: `${selected.away.abbr} at ${selected.home.abbr}`,
                paragraphs,
              })}
              onPinTeam={(abbr, name) => focus?.pin({ kind: 'team', id: `team:${abbr}`, abbr, name })}
              onPinNews={(id, headline, href) => focus?.pin({ kind: 'news', id: `news:${id}`, headline, summary: null, href })}
              onPinPlayer={(id) => {
                const player = engine?.d.players.find((p) => p.id === id)
                if (player) focus?.setPinned(player)
              }}
              canPin={Boolean(focus)}
            />
          )}
        </div>
        {!solo && ring(slots.right, 'right')}
        {!solo && ring(slots.bottom, 'bottom')}
      </div>
      {recent && (
        <div className="week-pop" role="dialog" aria-label={`Week ${recent.week ?? ''}`}>
          <p><b>{recent.result || '—'}</b> {recent.pointsFor ?? '—'}–{recent.pointsAgainst ?? '—'} {recent.atVs} {recent.opponent}{recent.week ? ` · Week ${recent.week}` : ''}</p>
          {headlinesForRecent(recent, []).length === 0 ? <p>No headline stored for this game.</p> : (
            <ul>{headlinesForRecent(recent, []).map((title) => <li key={title}>{title}</li>)}</ul>
          )}
          <button type="button" className="ghost" onClick={() => setRecent(null)}>Close</button>
        </div>
      )}
    </div>
  )
}

function Center({
  game,
  detail,
  detailError,
  roster,
  myId,
  onRecent,
  onPinArticle,
  onPinTeam,
  onPinNews,
  onPinPlayer,
  canPin,
}: {
  game: BoardGame
  detail: { context: GameContext | null; raw: unknown } | null
  detailError: boolean
  roster: DeskPlayer[]
  myId: number
  onRecent: (game: RecentGame) => void
  onPinArticle: (paragraphs: string[]) => void
  onPinTeam: (abbr: string, name: string) => void
  onPinNews: (id: string, headline: string, href: string | null) => void
  onPinPlayer: (id: string) => void
  canPin: boolean
}) {
  const raw = detail?.raw ?? null
  const ctx = detail?.context ?? null
  const situation = (raw && summarySituation(raw)) || game.situation
  const shown: BoardGame = situation && situation !== game.situation ? { ...game, situation } : game
  const watch = watchTarget(game.broadcast)
  const series = raw ? winSeries(raw) : []
  const current = raw ? currentHomeWin(raw) : null
  const plays = raw ? scoringPlaysFrom(raw) : []
  const drives = raw ? drivesFrom(raw) : []
  const standouts = raw ? standoutsFrom(raw) : []
  const box = raw ? boxScorePoints(raw) : []
  const mine = playersInGame(game, roster, myId)
  const headlines = raw ? headlinesFromSummary(raw, game.id, { names: [game.away.name, game.home.name], abbrs: [game.away.abbr, game.home.abbr] }) : []
  const injuries = ctx ? [
    ...ctx.away.injuries.map((row) => ({ team: ctx.away.name, name: row.name, status: row.status })),
    ...ctx.home.injuries.map((row) => ({ team: ctx.home.name, name: row.name, status: row.status })),
  ] : []
  const yours = mine.map((player) => ({
    name: player.name,
    proj: player.proj,
    scored: game.state === 'pre' ? null : box.find((row) => row.id === player.id)?.points ?? box.find((row) => row.name.toLowerCase() === player.name.toLowerCase())?.points ?? null,
  }))
  const facts = articleFacts({
    game,
    injuries,
    yours,
    headlines: headlines.map((item) => item.title),
    scoringPlays: plays.map((play) => play.text),
  })
  const paragraphs = gameArticle(facts)
  const ball = possessionAbbr(shown)
  const where = [game.venue, game.city, game.indoor === true ? 'Indoor' : game.indoor === false ? 'Outdoor' : null].filter(Boolean).join(' · ')

  return (
    <article>
      <header className="center-top">
        <p className="desk-where">{where || 'Site not on this pull'}</p>
        {watch ? (
          <a className="watch-btn" href={watch.href} target="_blank" rel="noreferrer">Watch on {watch.label}</a>
        ) : (
          <button type="button" className="watch-btn" disabled>{game.broadcast || 'No broadcast listed'}</button>
        )}
      </header>
      <div className="center-title">
        <h2 className="desk-team"><TeamLink abbr={game.away.abbr}>{game.away.name}</TeamLink> at <TeamLink abbr={game.home.abbr}>{game.home.name}</TeamLink></h2>
        {canPin && (
          <p className="news-next">
            <button type="button" className="ghost" onClick={() => onPinTeam(game.away.abbr, game.away.name)}>Pin {game.away.abbr}</button>
            <button type="button" className="ghost" onClick={() => onPinTeam(game.home.abbr, game.home.name)}>Pin {game.home.abbr}</button>
            <button type="button" className="ghost" onClick={() => onPinArticle(paragraphs)}>Pin article</button>
          </p>
        )}
      </div>
      {detailError && <p className="block-fail">Detail: injuries, drives, and the win-probability series did not load.</p>}
      {game.state === 'pre' ? (
        <Pregame game={game} ctx={ctx} paragraphs={paragraphs} yours={yours} mine={mine} onPinPlayer={onPinPlayer} canPin={canPin} onRecent={onRecent} />
      ) : (
        <LiveDesk
          game={shown}
          ball={ball}
          series={series}
          current={current}
          paragraphs={paragraphs}
          plays={plays}
          drives={drives}
          standouts={standouts}
          yours={yours}
          mine={mine}
          ctx={ctx}
          headlines={headlines}
          onPinPlayer={onPinPlayer}
          onPinNews={onPinNews}
          canPin={canPin}
          onRecent={onRecent}
        />
      )}
      <ClipStack gameId={game.id} away={game.away.name} home={game.home.name} />
    </article>
  )
}

function Pregame({
  game,
  ctx,
  paragraphs,
  yours,
  mine,
  onPinPlayer,
  canPin,
  onRecent,
}: {
  game: BoardGame
  ctx: GameContext | null
  paragraphs: string[]
  yours: { name: string; proj: number | null; scored: number | null }[]
  mine: DeskPlayer[]
  onPinPlayer: (id: string) => void
  canPin: boolean
  onRecent: (game: RecentGame) => void
}) {
  return (
    <div className="center-body">
      <div className="article">
        {paragraphs.map((line) => <p key={line}>{line}</p>)}
      </div>
      <p><b>Kickoff</b> {when(game.kickoff)}. {game.detail}. {game.broadcast ? `Watch: ${game.broadcast}.` : 'No broadcast listed.'}</p>
      {ctx?.predictor ? (
        <p className="win-dot"><i aria-hidden /> ESPN's matchup predictor has {game.home.abbr} at {ctx.predictor.home}% and {game.away.abbr} at {ctx.predictor.away}%. One figure, not a history.</p>
      ) : null}
      <MarketBlock game={game} />
      <section>
        <h3>Injuries</h3>
        {ctx ? <InjuryList teams={[ctx.away, ctx.home]} /> : <p className="muted">Injury report has not arrived.</p>}
      </section>
      <YourPlayers gameState="pre" yours={yours} mine={mine} onPinPlayer={onPinPlayer} canPin={canPin} />
      {ctx && (
        <div className="recent-row">
          <RecentStrip label={ctx.away.abbr} games={ctx.away.recent} onOpen={onRecent} />
          <RecentStrip label={ctx.home.abbr} games={ctx.home.recent} onOpen={onRecent} />
        </div>
      )}
    </div>
  )
}

function LiveDesk({
  game,
  ball,
  series,
  current,
  paragraphs,
  plays,
  drives,
  standouts,
  yours,
  mine,
  ctx,
  headlines,
  onPinPlayer,
  onPinNews,
  canPin,
  onRecent,
}: {
  game: BoardGame
  ball: string | null
  series: { home: number }[]
  current: number | null
  paragraphs: string[]
  plays: { id: string; text: string; clock: string; quarter: number | null; team: string; awayScore: number | null; homeScore: number | null }[]
  drives: { id: string; team: string; result: string; plays: { id: string; text: string; clock: string; down: string; scoring: boolean }[] }[]
  standouts: { label: string; name: string; stat: string }[]
  yours: { name: string; proj: number | null; scored: number | null }[]
  mine: DeskPlayer[]
  ctx: GameContext | null
  headlines: { id: string; title: string; href: string | null }[]
  onPinPlayer: (id: string) => void
  onPinNews: (id: string, headline: string, href: string | null) => void
  canPin: boolean
  onRecent: (game: RecentGame) => void
}) {
  return (
    <div className="center-body">
      <p className="score-line">
        <span className="desk-score">{game.away.abbr} {game.away.score ?? '—'}</span>
        <span className="desk-score">{game.home.abbr} {game.home.score ?? '—'}</span>
      </p>
      <p className="live-meta">
        {game.detail}
        {game.situation?.clock ? ` · ${game.situation.clock}` : ''}
        {ball ? ` · ${ball} has the ball` : ''}
        {game.situation?.redZone ? ' · Red zone' : ''}
      </p>
      {series.length > 0 ? <WinDots points={series} /> : (
        <p>{current != null ? `${current}% from ESPN's model. ` : 'ESPN\'s model. '}The play-by-play line has not arrived.</p>
      )}
      <div className="article">
        {paragraphs.map((line) => <p key={line}>{line}</p>)}
      </div>
      <div className="center-cols">
        <div>
          <h3>Scoring plays</h3>
          {plays.length === 0 ? <p className="muted">No scoring plays on this pull.</p> : (
            <ol className="play-list">
              {plays.map((play) => (
                <li key={play.id}>
                  <b>{play.team || 'Score'}</b> {play.text}
                  <small>{play.quarter ? ` Q${play.quarter}` : ''}{play.clock ? ` ${play.clock}` : ''}{play.awayScore != null && play.homeScore != null ? ` · ${play.awayScore}–${play.homeScore}` : ''}</small>
                </li>
              ))}
            </ol>
          )}
          <h3>Play-by-play</h3>
          {drives.length === 0 ? <p className="muted">No drives on this pull.</p> : (
            <div className="pbp">
              {drives.map((drive) => (
                <section key={drive.id}>
                  <h4>{drive.team} · {drive.result}</h4>
                  <ol>
                    {drive.plays.map((play) => (
                      <li key={play.id}>{play.clock} {play.down} {play.text}</li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </div>
        <div>
          <YourPlayers gameState={game.state} yours={yours} mine={mine} onPinPlayer={onPinPlayer} canPin={canPin} />
          <section>
            <h3>Standouts</h3>
            {standouts.length === 0 ? <p className="muted">No passing, rushing, or receiving line on this pull.</p> : (
              <ul className="inj-list">
                {standouts.map((row) => (
                  <li key={row.label}><b>{row.label}</b> <KnownName name={row.name} /> <span>{row.stat}</span></li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3>Injuries</h3>
            {ctx ? <InjuryList teams={[ctx.away, ctx.home]} /> : <p className="muted">Injury report has not arrived.</p>}
          </section>
          <MarketBlock game={game} />
          <section>
            <h3>Breaking news</h3>
            {headlines.length === 0 ? <p className="muted">No headline stored for this game.</p> : (
              <ul className="inj-list">
                {headlines.map((item) => (
                  <li key={item.id}>
                    {item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.title}</a> : item.title}
                    {canPin && <button type="button" className="ghost" onClick={() => onPinNews(item.id, item.title, item.href)}>Pin</button>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      {ctx && (
        <div className="recent-row">
          <RecentStrip label={ctx.away.abbr} games={ctx.away.recent} onOpen={onRecent} />
          <RecentStrip label={ctx.home.abbr} games={ctx.home.recent} onOpen={onRecent} />
        </div>
      )}
    </div>
  )
}

function YourPlayers({
  gameState,
  yours,
  mine,
  onPinPlayer,
  canPin,
}: {
  gameState: BoardGame['state']
  yours: { name: string; proj: number | null; scored: number | null }[]
  mine: DeskPlayer[]
  onPinPlayer: (id: string) => void
  canPin: boolean
}) {
  return (
    <section>
      <h3>Your players</h3>
      {yours.length === 0 ? <p className="muted">Nobody from your roster is in this game.</p> : (
        <ul className="inj-list">
          {yours.map((row, i) => {
            const id = mine[i]?.id
            return (
              <li key={row.name}>
                {id ? <PlayerLink id={id} name={row.name} /> : <b>{row.name}</b>}
                {gameState === 'pre' || row.scored == null ? (
                  <span>{row.proj == null ? 'No week projection stored' : `${row.proj} projected this week`}</span>
                ) : (
                  <span>{row.scored} so far · {row.proj == null ? 'no week projection stored' : `${row.proj} projected this week`}. Points so far and the projection are different numbers.</span>
                )}
                {canPin && id && <button type="button" className="ghost" onClick={() => onPinPlayer(id)}>Pin</button>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
